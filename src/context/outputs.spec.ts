import { describe, expect, it } from 'vitest'
import { createOutputs, type ActionOutputValue } from './outputs'

/** Widens the proxy type so `delete` is allowed in tests. */
const asRecord = (outputs: unknown): Record<string, ActionOutputValue | undefined> =>
  outputs as Record<string, ActionOutputValue | undefined>

describe('createOutputs', () => {
  describe('set and get', () => {
    it('stores and returns a string value', () => {
      const outputs = createOutputs()
      outputs.version = '1.0.0'
      expect(outputs.version).toBe('1.0.0')
    })

    it('stores and returns a number value', () => {
      const outputs = createOutputs()
      outputs['pr-number'] = 42
      expect(outputs['pr-number']).toBe(42)
    })

    it('stores and returns a boolean value', () => {
      const outputs = createOutputs()
      outputs.latest = true
      expect(outputs.latest).toBe(true)
    })

    it('overwrites a previously set value', () => {
      const outputs = createOutputs()
      outputs.version = '1.0.0'
      outputs.version = '2.0.0'
      expect(outputs.version).toBe('2.0.0')
    })

    it('supports dynamic (index-signature) keys', () => {
      const outputs = createOutputs()
      outputs['pnpm-version'] = '9.0.0'
      expect(outputs['pnpm-version']).toBe('9.0.0')
    })
  })

  describe('throw on unset read', () => {
    it('throws when reading a key that has not been set', () => {
      const outputs = createOutputs()
      expect(() => outputs.version).toThrow("Output 'version' has not been set yet.")
    })

    it('throws for dynamic keys that have not been set', () => {
      const outputs = createOutputs()
      expect(() => outputs['pnpm-version']).toThrow("Output 'pnpm-version' has not been set yet.")
    })

    it('returns undefined for symbol property access', () => {
      const outputs = createOutputs() as unknown as Record<symbol, unknown>
      expect(outputs[Symbol('test')]).toBeUndefined()
    })

    it('returns undefined for "then" to avoid Promise-like coercion', () => {
      const outputs = createOutputs()
      expect((outputs as Record<string, unknown>).then).toBeUndefined()
    })
  })

  describe('delete', () => {
    it('removes a previously set key', () => {
      const outputs = createOutputs()
      outputs.version = '1.0.0'

      delete asRecord(outputs).version

      expect(() => outputs.version).toThrow("Output 'version' has not been set yet.")
    })

    it('succeeds silently for a key that was never set', () => {
      const outputs = createOutputs()
      expect(() => {
        delete asRecord(outputs).version
      }).not.toThrow()
    })

    it('removes the key from enumeration', () => {
      const outputs = createOutputs()
      outputs.version = '1.0.0'
      outputs.latest = true

      delete asRecord(outputs).version

      expect(Object.keys(outputs)).toEqual(['latest'])
    })
  })

  describe('has (in operator)', () => {
    it('returns false for unset keys', () => {
      const outputs = createOutputs()
      expect('version' in outputs).toBe(false)
    })

    it('returns true for set keys', () => {
      const outputs = createOutputs()
      outputs.version = '1.0.0'
      expect('version' in outputs).toBe(true)
    })

    it('returns false after deletion', () => {
      const outputs = createOutputs()
      outputs.version = '1.0.0'

      delete asRecord(outputs).version

      expect('version' in outputs).toBe(false)
    })

    it('returns false for symbol keys', () => {
      const outputs = createOutputs()
      expect(Symbol('test') in outputs).toBe(false)
    })
  })

  describe('Object.keys / Object.values / Object.entries', () => {
    it('returns empty arrays when no outputs are set', () => {
      const outputs = createOutputs()
      expect(Object.keys(outputs)).toEqual([])
      expect(Object.values(outputs)).toEqual([])
      expect(Object.entries(outputs)).toEqual([])
    })

    it('returns all set keys, values, and entries', () => {
      const outputs = createOutputs()
      outputs.version = '1.0.0'
      outputs['pr-number'] = 42
      outputs.latest = true

      expect(Object.keys(outputs)).toEqual(['version', 'pr-number', 'latest'])
      expect(Object.values(outputs)).toEqual(['1.0.0', 42, true])
      expect(Object.entries(outputs)).toEqual([
        ['version', '1.0.0'],
        ['pr-number', 42],
        ['latest', true],
      ])
    })

    it('reflects insertion order', () => {
      const outputs = createOutputs()
      outputs.changelog = ''
      outputs.version = '1.0.0'
      outputs.environment = 'testing'

      expect(Object.keys(outputs)).toEqual(['changelog', 'version', 'environment'])
    })

    it('reflects deletions', () => {
      const outputs = createOutputs()
      outputs.version = '1.0.0'
      outputs.latest = true

      delete asRecord(outputs).version

      expect(Object.keys(outputs)).toEqual(['latest'])
      expect(Object.values(outputs)).toEqual([true])
    })
  })

  describe('isolation', () => {
    it('each createOutputs call produces an independent proxy', () => {
      const a = createOutputs()
      const b = createOutputs()

      a.version = '1.0.0'

      expect(() => b.version).toThrow("Output 'version' has not been set yet.")
    })
  })
})
