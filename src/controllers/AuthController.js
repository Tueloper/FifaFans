import model from './../models';
import { validate, inValidName, inValidEmail, inValidPassword, magicTrimmer } from './../utils/validator';
import { sendErrorResponse, sendSuccessResponse } from './../utils/sendResponse';
import { hashPassword, comparePassword } from './../utils/passwordHash';
import uploadImage from './../services/imageuploader';
import token from 'uuid';
import { SendMail, sendForgotPasswordMail } from './../services/emailsender';
import { createToken } from './../utils/processToken';
import { checkExpiredToken } from './../utils/dateChecker';
import helperMethods from './../utils/helpers';
const { User, Token, Profile } = model;

//Returns token for logged/signup in Users
const userToken = (user) => {
	const { email, name, role, uuid } = user;
	return {
		token: createToken({
			uuid,
			name,
			email,
			role
		})
	};
};

const AuthController = {
	/**
 *
 * User Sign up logic
 */
	async signup (req, res, next) {
		try {
			// get verify token
			const verifyId = token();

			// trims the req.body to remove trailling spaces
			const userData = magicTrimmer(req.body);
			// destructuring user details
			const { name, username, email, password, role, club, status } = userData;

			// validation of inputs
			const schema = {
				name: inValidName('Full name', name),
				email: inValidEmail(email),
				password: inValidPassword(password)
			};

			// return console.log(schema);
			const validateErrors = validate(schema);
			if (validateErrors) return sendErrorResponse(res, 422, validateErrors);

			// checking if the username & email already exist
			const userName = await User.findOne({ where: { username } });
			const registeredEmail = await User.findOne({ where: { email } });
			if (userName) return sendErrorResponse(res, 409, 'Username Already Exist!!');
			if (registeredEmail) return sendErrorResponse(res, 409, 'Email Already Exist!!');

			//hash passwords and save in database
			const hashedPassword = hashPassword(password);

			const newUser = await User.create({
				username,
				name,
				email,
				password: hashedPassword,
				club,
				status,
				role: role === 'user' ? 'user' : 'admin'
			});

			//create a binary 64 string for user identity and save user
			await Token.create({
				user_uuid: newUser.dataValues.uuid,
				verifyId
			});

			//send email verification mail
			SendMail(email, verifyId, newUser.uuid);
			return sendSuccessResponse(res, 201, {
				message: 'Kindly Verify Account To Log In, Thanks!!'
			});
			// res.render('verify', {message: 'Please verify your account'});
		} catch (e) {
			console.log(e);
			return next(e);
		}
	},

	async getAllUserUsernameAndEmail (req, res, next) {
		try {
			const usernames = await helperMethods.getAllUsernameAndEmail(User);

			return sendSuccessResponse(res, 200, usernames);
		} catch (e) {
			return next(e);
		}
	},

	/**
	 *Verification link confirmation from email link
	 * @query {id} req
	 * @query {id} req
	 * @query {uuid} res
	 * @param {*} next
	 */
	async verifyUser (req, res, next) {
		try {
			// extracting the token and id from the query
			const { token, id } = req.params;

			// verify if the token exist
			const verifyToken = await Token.findOne({
				where: {
					user_uuid: id,
					verifyId: token
				}
			});
			if (!verifyToken) return sendErrorResponse(res, 400, 'No User With The Token Supplied!!!');

			// checck if user exist
			const user = await User.findOne({ where: { uuid: id } });
			if (!user) return sendErrorResponse(res, 401, 'User is not available');
			if (user.dataValues.verified === true) return sendErrorResponse(res, 409, 'User is Already Verified!!!');

			// checking if the email link has expired
			const { createdAt } = verifyToken.dataValues;
			// return console.log(createdAt);
			const timeDiff = checkExpiredToken(createdAt);
			if (timeDiff !== 0) {
				return sendErrorResponse(
					res,
					400,
					'Email Link has Expired \n Click this button to get a new verification token'
				);
			}

			//if it passess all the valication
			await User.update(
				{
					verified: true
				},
				{
					where: {
						uuid: id
					}
				}
			);
			return sendSuccessResponse(res, 200, '<h2>Your Account has been Verified Successfully</h2>');
		} catch (e) {
			return next(e);
		}
	},

	async getNewEmailToken (req, res, next) {
		try {
			const verifyId = token();
			const { email } = req.body;

			// get user and create another token
			const user = await User.findOne({ where: { email } });

			if (!user) return sendErrorResponse(res, 404, 'Email not available, please check and try again');

			// generate another token
			await Token.create({
				verifyId,
				user_uuid: user.dataValues.uuid
			});

			SendMail(email, verifyId, user.dataValues.uuid);
			return sendSuccessResponse(res, 200, 'Link Sent, Please Check your mail and Verify Account, Thanks!!!');
		} catch (e) {
			return next(e);
		}
	},

	async signin (req, res, next) {
		try {
			// extracting user data
			const { email, password, username } = req.body;

			// checking if the user exist
			const user =
				email ? await User.findOne({ where: { email } }) :
				await User.findOne({ where: { username } });

			if (!user) return sendErrorResponse(res, 404, 'User Not Found!!');

			// compare password
			const checkPassword = comparePassword(password, user.dataValues.password);
			if (!checkPassword) return sendErrorResponse(res, 400, 'Incorrect Password');

			// check user verification
			if (!user.dataValues.verified) return sendErrorResponse(res, 401, 'Verify Your Account ');
			const token = userToken(user.dataValues);

			return sendSuccessResponse(res, 200, token);
		} catch (e) {
			return next(e);
		}
	},

	async me (req, res, next) {
		try {
			const user = req.userData;
			return sendSuccessResponse(res, 200, user);
		} catch (e) {
			console.log(e);
			return next(e);
		}
	},

	async forgetPassword (req, res, next) {
		try {
			const forgetPasswordId = token();
			const { email } = req.body;
			// check if the email exist
			const user = await User.findOne({ where: { email } });
			if (!user) return sendErrorResponse(res, 500, 'User Not Found!!');

			// create a token to be sent to the user email
			await Token.create({
				user_uuid: user.dataValues.uuid,
				forgetPasswordId
			});
			sendForgotPasswordMail(email, forgetPasswordId, user.dataValues.uuid);
			return sendSuccessResponse(res, 200, 'Password Reset Link Sent ');
		} catch (e) {
			return next(e);
		}
	},

	async verifyPasswordLink (req, res, next) {
		try {
			const { token, id, email } = req.params;
			const verifyToken = await Token.findOne({
				where: {
					user_uuid: id,
					forgetPasswordId: token
				}
			});
			if (!verifyToken) return sendErrorResponse(res, 400, 'No User With The Token Supplied!!!');

			// find user
			const user = await User.findOne({ where: { uuid: id } });
			if (!user) return sendErrorResponse(res, 401, 'User is not available');

			// checking if the email link has expired
			const { createdAt } = verifyToken.dataValues;
			const timeDiff = checkExpiredToken(createdAt);
			if (timeDiff !== 0) {
				return sendErrorResponse(
					res,
					400,
					'Email Link has Expired \n Click this button to get a new verification token'
				);
			}

			return sendSuccessResponse(res, 200, { email, message: 'User Confirmed, redirect to password reset page..' });
		} catch (e) {
			return next(e);
		}
	},

	async resetPassword (req, res, next) {
		try {
			const { email } = req.userData;
			const { newPassword, oldPassword } = req.body;
			const hashedPassword = hashPassword(newPassword);
			const user = await User.findOne({ where: { email } });
			if (!user) return sendErrorResponse(res, 500, 'User Not Found!!');
			const checkPassword = comparePassword(oldPassword, user.dataValues.password);
			if (!checkPassword) return sendErrorResponse(res, 400, 'Incorrect Password');
			await User.update(
				{ password: hashedPassword },
				{
					returning: true,
					where: { email }
				}
			);

			return sendSuccessResponse(res, 200, 'Password Reset Successfull ');
		} catch (e) {
			return next(e);
		}
	},

	async updateUser (req, res, next) {
		try {
			let avatar, aboutDetails, profileDetails, profileData, userDetails;
			const user = req.userData;

			// trim the body
			const userData = await magicTrimmer(req.body);
			const { name, phone, address, club, gender, shortBio, favoriteQuote, language, website } = userData;

			// does this user have a profile
			const profile = await Profile.findOne({
				where: { user_uuid: user.uuid }
			});
			// return console.log(user, profile);
			// fetching user data
			aboutDetails = {
				name: name,
				phone: phone,
				address: address,
				club: club
			};

			// if there is a image
			if (req.file !== undefined) {
				avatar = await uploadImage(req.file);
				profileDetails = {
					profile_pic: avatar,
					gender: gender,
					shortBio: shortBio,
					favoriteQuote: favoriteQuote,
					language: language,
					website: website
				};
			}
			else {
				profileDetails = {
					gender: gender,
					shortBio: shortBio,
					favoriteQuote: favoriteQuote,
					language: language,
					website: website
				};
			}
			// return console.log(profileDetails, aboutDetails);

			if (profile) {
				profileData = await Profile.update(profileDetails, {
					returning: true,
					where: { user_uuid: user.uuid }
				});
			}
			else {
				profileData = await Profile.create({
					...profileDetails,
					user_uuid: user.uuid
				});
			}

			userDetails = await User.update(aboutDetails, {
				returning: true,
				where: { uuid: user.uuid }
			});

			return sendSuccessResponse(res, 200, { userDetails, profileData });
		} catch (e) {
		console.log(e);
			return next(e);
		}
	}
};

export default AuthController;
