import { handlers } from "@query/auth";

const { GET: _GET, POST: _POST } = handlers;

export const GET = _GET as any;
export const POST = _POST as any;