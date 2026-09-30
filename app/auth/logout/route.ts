import { NextResponse } from "next/server";
import { env } from "@/lib/env";
export async function GET(request:Request){const r=NextResponse.redirect(new URL("/",env.SITE_ORIGIN||request.url));r.cookies.delete("uek_session");return r;}
