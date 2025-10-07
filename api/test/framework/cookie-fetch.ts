class ConnectedWalletCookieJar {
  private cookies = new Map<string, string>();
  storeFromResponse(res: Response) {
    const cookieHeader =
      res.headers.get('set-cookie')?.match(/connected-wallet=([^;]+)/)?.[0] ||
      '';

    this.cookies.set('connected-wallet', cookieHeader);
  }
  getConnectedWalletCookie(): string {
    return this.cookies.get('connected-wallet') || '';
  }
}

export function createCookieFetch(baseFetch = fetch) {
  const jar = new ConnectedWalletCookieJar();

  return {
    fetch: async (input: RequestInfo, init?: RequestInit) => {
      const headers = new Headers(init?.headers as HeadersInit);
      const cookieHeader = jar.getConnectedWalletCookie();
      if (cookieHeader) headers.set('Cookie', cookieHeader);
      const newInit = { ...init, headers };

      const res = await baseFetch(input, newInit);
      jar.storeFromResponse(res as Response);
      return res;
    },
    jar,
  };
}
