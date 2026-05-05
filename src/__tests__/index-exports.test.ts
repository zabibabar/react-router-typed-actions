import { describe, expect, it } from "vitest";
import {
  actionFailure,
  actionSuccess,
  createFormData,
  defineAction,
  isMetaOverride,
  registerActions,
  resolveFormData,
  useActionFetcher,
  withMetaOverrides,
} from "../index";

describe("package root exports", () => {
  it("exposes the expected runtime exports", () => {
    expect(typeof defineAction).toBe("function");
    expect(typeof registerActions).toBe("function");
    expect(typeof createFormData).toBe("function");
    expect(typeof resolveFormData).toBe("function");
    expect(typeof actionSuccess).toBe("function");
    expect(typeof actionFailure).toBe("function");
    expect(typeof withMetaOverrides).toBe("function");
    expect(typeof isMetaOverride).toBe("function");
    expect(typeof useActionFetcher).toBe("function");
  });

  it("supports a root-imported action flow", async () => {
    const rootAction = defineAction({
      type: "root/imported",
      resolve: (payload: { id: string }) => ({ ok: true, id: payload.id }),
    });
    registerActions([rootAction]);

    const { formData } = createFormData(rootAction, { id: "abc" });
    const resolved = resolveFormData(formData);
    const result = await resolved.resolve();

    expect(result).toEqual({ ok: true, id: "abc" });
    expect(actionSuccess(resolved, result)).toEqual({
      type: "root/imported",
      success: true,
      response: { ok: true, id: "abc" },
    });
  });
});
