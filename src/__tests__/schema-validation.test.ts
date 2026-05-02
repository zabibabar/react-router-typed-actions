import { describe, it, expect } from "vitest";
import { defineAction, buildActionModule, type SchemaLike } from "../define-action";
import { createActionsFactory } from "../factory";

// ─── Mock schema (Zod-like interface) ────────────────────────────

function createSchema<T>(
  validate: (data: unknown) => data is T,
  errorMessage = "Validation failed",
): SchemaLike<T> {
  return {
    parse(data: unknown): T {
      if (!validate(data)) {
        throw new Error(errorMessage);
      }
      return data;
    },
  };
}

const nameSchema = createSchema<{ name: string }>(
  (d): d is { name: string } =>
    typeof d === "object" &&
    d !== null &&
    "name" in d &&
    typeof (d as Record<string, unknown>).name === "string",
  "Expected object with string 'name' field",
);

// ─── Fixtures ────────────────────────────────────────────────────

const validatedAction = defineAction({
  type: "validatedAction",
  method: "post",
  resolve: (payload: { name: string }) => ({ ok: true }),
  successMessage: "ok",
  errorMessage: "fail",
  schema: nameSchema,
});

const noSchemaAction = defineAction({
  type: "noSchemaAction",
  method: "post",
  resolve: (payload: { value: number }) => ({ ok: true }),
  successMessage: "ok",
  errorMessage: "fail",
});

const module = buildActionModule({ validatedAction, noSchemaAction });
const factory = createActionsFactory(module);

// ─── Tests ───────────────────────────────────────────────────────

describe("schema validation on resolveFormData", () => {
  it("passes validation for valid payload", () => {
    const { formData } = factory.createFormData("validatedAction", {
      name: "Alice",
    });
    const action = factory.resolveFormData(formData);
    expect(action.payload).toEqual({ name: "Alice" });
  });

  it("throws descriptive error for invalid payload", () => {
    const { formData } = factory.createFormData(
      "validatedAction",
      { name: 42 } as never,
    );
    expect(() => factory.resolveFormData(formData)).toThrow(
      /Payload validation failed for action "validatedAction"/,
    );
    expect(() => factory.resolveFormData(formData)).toThrow(
      /Expected object with string 'name' field/,
    );
  });

  it("skips validation when no schema is defined", () => {
    const { formData } = factory.createFormData("noSchemaAction", {
      value: 123,
    });
    const action = factory.resolveFormData(formData);
    expect(action.payload).toEqual({ value: 123 });
  });

  it("works with any custom .parse() object", () => {
    const customSchema: SchemaLike<{ id: number }> = {
      parse(data) {
        const obj = data as Record<string, unknown>;
        if (typeof obj.id !== "number") throw new Error("id must be number");
        return data as { id: number };
      },
    };

    const customAction = defineAction({
      type: "customAction",
      method: "post",
      resolve: (p: { id: number }) => p,
      successMessage: "ok",
      errorMessage: "fail",
      schema: customSchema,
    });

    const f = createActionsFactory(buildActionModule({ customAction }));

    const { formData: good } = f.createFormData("customAction", { id: 1 });
    expect(f.resolveFormData(good).payload).toEqual({ id: 1 });

    const { formData: bad } = f.createFormData("customAction", {
      id: "not-a-number",
    } as never);
    expect(() => f.resolveFormData(bad)).toThrow(
      /Payload validation failed for action "customAction"/,
    );
  });
});
