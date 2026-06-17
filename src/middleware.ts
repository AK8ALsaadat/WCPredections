import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

import { getIronSession } from "iron-session";

import {

  sessionOptions,

  type SessionData,

} from "@/lib/session-config";



const protectedPaths = [

  "/dashboard",

  "/matches",

  "/predict",

  "/leaderboard",

  "/profile",

  "/admin",

  "/tutorial",

  "/knockout-tutorial",

];



const authPaths = ["/login", "/register"];



export async function middleware(request: NextRequest) {

  const { pathname } = request.nextUrl;



  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

  const isAuthPage = authPaths.some((p) => pathname.startsWith(p));



  if (!isProtected && !isAuthPage) {

    return NextResponse.next();

  }



  const response = NextResponse.next();

  const session = await getIronSession<SessionData>(

    request,

    response,

    sessionOptions

  );



  const isLoggedIn = !!session.user;



  if (isProtected && !isLoggedIn) {

    return NextResponse.redirect(new URL("/login", request.url));

  }



  if (isAuthPage && isLoggedIn) {

    return NextResponse.redirect(new URL("/dashboard", request.url));

  }



  if (pathname.startsWith("/admin") && isLoggedIn && !session.user?.isAdmin) {

    return NextResponse.redirect(new URL("/dashboard", request.url));

  }



  return response;

}



export const config = {

  matcher: [

    "/dashboard/:path*",

    "/matches/:path*",

    "/predict/:path*",

    "/leaderboard",

    "/leaderboard/:path*",

    "/profile/:path*",

    "/admin/:path*",

    "/tutorial",

    "/knockout-tutorial",

    "/login",

    "/register",

  ],

};

