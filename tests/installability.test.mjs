/**
 * Bundle installability tests against the extracted DSH runtime.
 *
 * Contract source: docs/DESIGN.md "Bundle manifest" and DSH's own
 * `dsh-app-boot` behavior (the Loader anchors a relative inserted plugin name
 * beside the patch file; Plugin Manager reads locale/icon metadata through the
 * package exports). These tests call the runtime's real helpers rather than
 * re-implementing the resolution rules.
 *
 * Skips with an explicit message when the runtime is unavailable.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, describe, test } from 'node:test'

import { PACKAGE_ROOT, packagePath, readJson, resolveRuntime, runtimeSkipMessage } from './support/fixtures.mjs'

const runtime = resolveRuntime()
const manifest = readJson(packagePath('package.json'))

const installabilitySkip = !runtime.available
  ? runtimeSkipMessage(runtime)
  : runtime.has.appBoot
    ? false
    : 'DSH runtime lacks @deepseek-ai/dsh-app-boot/lib/index.js; cannot verify anchoring and inventory metadata'

describe('bundle installability (extracted runtime)', { skip: installabilitySkip }, () => {
    /** @type {string | undefined} */
    let probeRoot

    after(() => {
      if (probeRoot !== undefined) rmSync(probeRoot, { recursive: true, force: true })
    })

    test('bundlePatchPaths resolves the declared patch file inside the package', async () => {
      const appBoot = await import(runtime.urls.appBoot)
      const patchFiles = appBoot.bundlePatchPaths(PACKAGE_ROOT, manifest.dsh.bundle)
      assert.deepEqual(patchFiles, [resolve(packagePath('cordis.patch.yml'))])
    })

    test('the Loader anchors ./lib/index.js beside the patch and the file exists', async () => {
      const appBoot = await import(runtime.urls.appBoot)
      const patches = appBoot.loadOverlayPatches('dsh', resolve(packagePath('cordis.patch.yml')))
      const rows = patches.flatMap((patch) => patch.insert ?? [])
      assert.equal(rows.length, 1)
      assert.equal(rows[0].id, 'superpowers')
      const expectedUrl = pathToFileURL(resolve(packagePath('lib', 'index.js'))).href
      assert.equal(rows[0].name, expectedUrl, 'the relative anchor must resolve next to cordis.patch.yml')
      assert.equal(existsSync(fileURLToPath(rows[0].name)), true)
      assert.equal(realpathSync(fileURLToPath(rows[0].name)), realpathSync(packagePath('lib', 'index.js')))
    })

    test('a profile listing the bundle composes the anchored plugin row', async () => {
      const appBoot = await import(runtime.urls.appBoot)
      const installAnchor = findDshPackageJson(runtime.modules)
      if (installAnchor === undefined) {
        // The extracted layout normally contains the dsh package.json above the
        // @deepseek-ai directory; without it the runtime cannot resolve bundles.
        return
      }
      const profileDir = mkdtempSync(join(tmpdir(), 'dsh-superpowers-profile-'))
      try {
        mkdirSync(join(profileDir, 'node_modules', '@local'), { recursive: true })
        symlinkSync(resolve(PACKAGE_ROOT), join(profileDir, 'node_modules', '@local', 'dsh-superpowers'), 'dir')
        writeFileSync(
          join(profileDir, 'package.json'),
          JSON.stringify(
            {
              name: 'dsh-superpowers-verification-profile',
              private: true,
              version: '0.0.0',
              dependencies: { [manifest.name]: `file:${resolve(PACKAGE_ROOT)}` },
              dsh: { profile: { bundles: [manifest.name] } },
            },
            null,
            2,
          ),
        )
        const profile = appBoot.loadProfileDirectory('dsh', profileDir, installAnchor, { userLayer: false })
        assert.equal(profile.skippedBundles.length, 0)
        assert.equal(profile.layers.length, 1)
        assert.equal(profile.layers[0].packageName, manifest.name)
        assert.equal(profile.layers[0].patches.length, 1)
        const rows = profile.layers.flatMap((layer) => layer.patches.flatMap((patch) => patch.insert ?? []))
        assert.equal(rows.length, 1)
        assert.equal(rows[0].id, 'superpowers')
        const anchored = fileURLToPath(rows[0].name)
        assert.equal(anchored, resolve(join(profileDir, 'node_modules', '@local', 'dsh-superpowers', 'lib', 'index.js')))
        assert.equal(existsSync(anchored), true)
      } finally {
        rmSync(profileDir, { recursive: true, force: true })
      }
    })

    test('Plugin Manager inventory metadata resolves through the package exports', async () => {
      const appBoot = await import(runtime.urls.appBoot)
      // Simulate an installed profile: the package resolved as a dependency name
      // from a parent module. This exercises the same ESM resolution Plugin
      // Manager uses for `locale/*.json` and `./icon`.
      probeRoot = mkdtempSync(join(tmpdir(), 'dsh-superpowers-install-'))
      mkdirSync(join(probeRoot, 'node_modules', '@local'), { recursive: true })
      symlinkSync(resolve(PACKAGE_ROOT), join(probeRoot, 'node_modules', '@local', 'dsh-superpowers'), 'dir')
      const parentURL = pathToFileURL(join(probeRoot, 'index.js')).href

      const meta = appBoot.readPluginMeta(manifest.name, parentURL)
      assert.ok(meta, 'readPluginMeta must resolve the package')
      assert.equal(meta.error, undefined, `metadata diagnostic: ${meta.error}`)
      assert.equal(meta.title.en, 'Superpowers')
      assert.equal(typeof meta.title.zh, 'string')
      assert.equal(meta.title.zh.length > 0, true)
      assert.equal(typeof meta.description.en, 'string')
      assert.equal(meta.description.en.length > 0, true)
      assert.equal(typeof meta.description.zh, 'string')
      assert.equal(meta.description.zh.length > 0, true)
      assert.equal(typeof meta.icon, 'string')
      assert.equal(meta.icon.startsWith('data:image/svg+xml;base64,'), true, 'the SVG icon must resolve via exports["./icon"]')
      assert.ok(meta.icon.length < 512 * 1024)
    })
})

/** Walk up from the resolved packages directory to the running dsh package.json. */
function findDshPackageJson(modules) {
  let directory = modules
  while (directory !== dirname(directory)) {
    const candidate = join(directory, 'package.json')
    if (existsSync(candidate)) {
      try {
        if (JSON.parse(readFileSync(candidate, 'utf8')).name === '@deepseek-ai/dsh') return candidate
      } catch {
        // Not a readable manifest; keep walking upward.
      }
    }
    directory = dirname(directory)
  }
  return undefined
}
