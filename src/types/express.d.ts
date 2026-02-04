import { Types } from 'mongoose';

export interface IRequestUser {
  _id: Types.ObjectId;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: IRequestUser;
    }
  }
}
