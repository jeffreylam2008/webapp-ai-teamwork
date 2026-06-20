/**
 * PHP crypt() function implementation for Node.js
 * Compatibility with PHP's crypt() for passwords with salt "password"
 */

import unixCrypt from 'unix-crypt-td-js';

export function verifyPhpCrypt(plainPassword: string, cryptHash: string): boolean {
  try {
    const salt = cryptHash.substring(0, 2);
    const generated = phpCrypt(plainPassword, salt);
    return generated === cryptHash;
  } catch {
    return false;
  }
}

export function phpCrypt(password: string, salt: string): string {
  const desSalt = salt.substring(0, 2);
  return unixCrypt(password, desSalt);
}

export function verifyPhpCryptDirect(plainPassword: string, cryptHash: string): boolean {
  const knownSalt = 'pa';
  if (!cryptHash.startsWith(knownSalt)) return false;
  return phpCrypt(plainPassword, knownSalt) === cryptHash;
}

export function testPhpCrypt() {
  const testCases = [
    { password: 'password', hash: 'pa4.HHSXL55NA' },
    { password: 'admin', hash: 'paZ6k2udQzJRE' },
  ];
  testCases.forEach(({ password, hash }) => {
    console.log(`Testing: ${password} -> ${hash}`, verifyPhpCrypt(password, hash) ? 'PASS' : 'FAIL');
  });
}

const phpCryptUtils = { verifyPhpCrypt, phpCrypt, verifyPhpCryptDirect, testPhpCrypt };
export default phpCryptUtils;
