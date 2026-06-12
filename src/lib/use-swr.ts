import useSWR, { type SWRConfiguration } from "swr";
import { clientFetch } from "./client-fetch";

export function useApi<T = unknown>(
  url: string | null,
  init?: RequestInit,
  swrOptions?: SWRConfiguration
) {
  const fetcher = async (input: string) => {
    const res = await clientFetch(input, init);
    if (!res) throw new Error("NetworkError");
    return (await res.json()) as T;
  };

  return useSWR<T>(url ?? null, url ? fetcher : null, swrOptions);
}

export default useApi;
