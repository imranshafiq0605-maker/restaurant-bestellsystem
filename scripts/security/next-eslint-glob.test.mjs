import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ESLint } from "eslint";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const pluginRequire = createRequire(require.resolve("@next/eslint-plugin-next"));
const { getRootDirs } = pluginRequire("./utils/get-root-dirs.js");
const directories = (paths) => paths.map((path) => resolve(path)).sort();

test("Next.js resolves its application root without a glob setting", () => {
  assert.deepEqual(getRootDirs({ cwd: root, settings: {} }), [root]);
});

test("Next.js root discovery supports brace patterns and directories only", () => {
  const result = getRootDirs({
    cwd: root,
    settings: { next: { rootDir: join(root, "app/{api,lib,page.tsx}") } },
  });
  assert.deepEqual(directories(result), directories([join(root, "app/api"), join(root, "app/lib")]));
});

test("Next.js root discovery supports an array of root patterns", () => {
  const result = getRootDirs({
    cwd: root,
    settings: { next: { rootDir: [join(root, "app/api"), join(root, "app/lib")] } },
  });
  assert.deepEqual(directories(result), directories([join(root, "app/api"), join(root, "app/lib")]));
});

test("Next.js lint rules remain active after replacing the glob dependency", async () => {
  const eslint = new ESLint({ cwd: root, overrideConfig: [{ settings: { next: { rootDir: root } } }] });
  const [result] = await eslint.lintText(
    'export default function Example() { return <img src="/images/example.jpg" alt="Example" />; }',
    { filePath: join(root, "app/security-lint-fixture.tsx") },
  );
  assert.ok(result.messages.some((message) => message.ruleId === "@next/next/no-img-element"));
  assert.equal(result.fatalErrorCount, 0);
});
