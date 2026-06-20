declare module 'unix-crypt-td-js' {
  function unixCrypt(password: string, salt: string): string;
  export default unixCrypt;
}
