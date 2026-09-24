import { NextResponse } from "next/server";
export async function GET(request:Request){const r=NextResponse.redirect(new URL("/",request.url));r.cookies.delete("uek_session");return r;}
