import models from '../models';
import { joinGroup, sendMessageToGroup} from './socketUtil';
import helperMethods from '../utils/helpers';

const { ChatRoom, ChatRoomMember, RoomChat, Socket, User } = models;
export default async function (socket, io, user){
  // a user joins a room onces
  socket.on('join-room', async (data) => {
    try {
      const { group_uuid } = data;
      // check if the user has been saved as member, if not create a new one
      const exist = await helperMethods.checkRoomMember(user.uuid);
      if (!exist) { joinGroup(group_uuid, user, socket, io)}
      socket.join(group_uuid, () => {
        socket.on(`${group_uuid}-message`, (data) => {
          const { message, group_id, parent_uuid } = data;
          sendMessageToGroup(group_id, message, user, io, parent_uuid);
        })
      })
      
    } catch (error) {
        console.log(error);
    }
  })
};
