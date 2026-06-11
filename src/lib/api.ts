import { NextResponse } from "next/server";
import type { ApiResponse } from "@/types";

export function apiSuccess<T>(data: T, status = 200, init?: ResponseInit) {
  const body: ApiResponse<T> = { success: true, data };
  return NextResponse.json(body, { status, ...init });
}

export function apiError(message: string, status = 400) {
  const body: ApiResponse<never> = { success: false, error: message };
  return NextResponse.json(body, { status });
}

export function handleApiError(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "Unauthorized") {
      return apiError("Unauthorized", 401);
    }
    if (error.message === "Forbidden") {
      return apiError("Forbidden", 403);
    }
    return apiError(error.message, 400);
  }
  return apiError("Internal server error", 500);
}
