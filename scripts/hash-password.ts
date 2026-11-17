// 강사 초기 비밀번호의 해시와 솔트를 만든다.
// 사용: node scripts/hash-password.ts "비밀번호"
import { hashPassword, newSalt } from "../worker/lib/password.ts";

const password = process.argv[2];
if (!password || password.length < 8) {
  console.error('8자 이상 비밀번호를 넣어 주세요: node scripts/hash-password.ts "비밀번호"');
  process.exit(1);
}
const salt = newSalt();
console.log(`ADMIN_PASSWORD_SALT=${salt}`);
console.log(`ADMIN_PASSWORD_HASH=${await hashPassword(password, salt)}`);
