import { describe, expect, it } from 'vitest'
import { getGreeting } from './greeting'

describe('getGreeting', () => {
  it('adapta el saludo a la hora local', () => {
    expect(getGreeting(8)).toBe('Buenos días')
    expect(getGreeting(15)).toBe('Buenas tardes')
    expect(getGreeting(22)).toBe('Buenas noches')
  })
})
