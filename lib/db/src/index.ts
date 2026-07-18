import mongoose from "mongoose";

// Configure global toJSON transform: _id → id, strip __v
mongoose.set("toJSON", {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

let connected = false;

export async function connectDB(): Promise<void> {
  if (connected) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI must be set.");
  await mongoose.connect(uri);
  connected = true;
}

export { mongoose };
export * from "./schema/index.js";
