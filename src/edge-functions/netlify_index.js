  import { handleRequest } from "../handle_request.js";

  export default async(req, context) => {
    const url = new URL(req.url);
    console.log('Request URL:', req.url);
    
    return handleRequest(req);
  }

  export const config = {
    path: "/*"
  };