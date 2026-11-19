import { describe, expect, it, vi } from "vitest";
import {
  ExactAuthError,
  ExactNotConnectedError,
  createRefresher,
  resolveAccessToken,
  type TokenRow,
  type TokenStore,
} from "./token";

const NOW = Date.parse("2026-11-19T12:00:00Z");
const inMs = (ms: number) => new Date(NOW + ms).toISOString();

function fakeStore(initial: TokenRow | null) {
  let row = initial;
  const store: TokenStore & { row: () => TokenRow | null; saves: TokenRow[] } = {
    read: vi.fn(async () => row),
    save: vi.fn(async (r: TokenRow) => {
      store.saves.push(r);
      row = r;
    }),
    row: () => row,
    saves: [],
  };
  return { store, set: (r: TokenRow) => (row = r) };
}

const tokenResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const cfg = { baseUrl: "https://exact.test", clientId: "cid", clientSecret: "secret" };

describe("resolveAccessToken", () => {
  it("gooit ExactNotConnectedError zonder refresh token", async () => {
    const { store } = fakeStore(null);
    await expect(resolveAccessToken(store, vi.fn(), () => NOW)).rejects.toBeInstanceOf(ExactNotConnectedError);
  });

  it("geeft een geldig token terug zonder te verversen", async () => {
    const { store } = fakeStore({ access_token: "a1", refresh_token: "r1", expires_at: inMs(5 * 60_000) });
    const refresh = vi.fn();
    expect(await resolveAccessToken(store, refresh, () => NOW)).toBe("a1");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("ververst binnen 60 s van expiry en slaat het geroteerde refresh token op", async () => {
    const { store } = fakeStore({ access_token: "a1", refresh_token: "r1", expires_at: inMs(30_000) });
    const fetchFn = vi.fn(async () => tokenResponse({ access_token: "a2", refresh_token: "r2", expires_in: "600" }));
    const token = await resolveAccessToken(store, createRefresher(cfg, fetchFn), () => NOW);
    expect(token).toBe("a2");
    expect(store.row()).toEqual({ access_token: "a2", refresh_token: "r2", expires_at: inMs(600_000) });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://exact.test/api/oauth2/token");
    const body = new URLSearchParams(String(init.body));
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("r1");
    expect(body.get("client_id")).toBe("cid");
  });

  it("gebruikt het token van een gelijktijdige run als de eigen refresh faalt", async () => {
    const { store, set } = fakeStore({ access_token: "a1", refresh_token: "r1", expires_at: inMs(-1000) });
    // Andere run ververste net met r1 → Exact weigert r1 nu (invalid_grant); store heeft al r2/a2.
    const fetchFn = vi.fn(async () => {
      set({ access_token: "a2", refresh_token: "r2", expires_at: inMs(600_000) });
      return tokenResponse({ error: "invalid_grant" }, 400);
    });
    const token = await resolveAccessToken(store, createRefresher(cfg, fetchFn), () => NOW);
    expect(token).toBe("a2");
    expect(store.saves).toHaveLength(0);
  });

  it("gooit de oorspronkelijke fout als er geen nieuwer token is opgeslagen", async () => {
    const { store } = fakeStore({ access_token: "a1", refresh_token: "r1", expires_at: inMs(-1000) });
    const fetchFn = vi.fn(async () => tokenResponse({ error: "invalid_grant" }, 400));
    await expect(resolveAccessToken(store, createRefresher(cfg, fetchFn), () => NOW)).rejects.toBeInstanceOf(
      ExactAuthError,
    );
  });

  it("ververst één keer opnieuw met het nieuwe refresh token als dat al verlopen access token heeft", async () => {
    const { store, set } = fakeStore({ access_token: "a1", refresh_token: "r1", expires_at: inMs(-1000) });
    const fetchFn = vi
      .fn()
      .mockImplementationOnce(async () => {
        set({ access_token: "a2", refresh_token: "r2", expires_at: inMs(10_000) }); // bijna verlopen
        return tokenResponse({ error: "invalid_grant" }, 400);
      })
      .mockImplementationOnce(async () => tokenResponse({ access_token: "a3", refresh_token: "r3", expires_in: 600 }));
    const token = await resolveAccessToken(store, createRefresher(cfg, fetchFn), () => NOW);
    expect(token).toBe("a3");
    expect(new URLSearchParams(String((fetchFn.mock.calls[1] as [string, RequestInit])[1].body)).get("refresh_token")).toBe("r2");
    expect(store.row()?.refresh_token).toBe("r3");
  });
});
