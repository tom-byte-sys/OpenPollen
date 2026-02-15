# 示例代码审查输出

## 审查结果

**[严重]** `src/auth.ts:15` — 密码使用 MD5 哈希，应改用 bcrypt 或 argon2
```typescript
// 当前
const hash = md5(password);
// 建议
const hash = await bcrypt.hash(password, 12);
```

**[建议]** `src/db.ts:42` — SQL 查询拼接字符串，存在注入风险
```typescript
// 当前
const query = `SELECT * FROM users WHERE name = '${name}'`;
// 建议
const query = 'SELECT * FROM users WHERE name = ?';
const result = await db.execute(query, [name]);
```

**[优化]** `src/utils.ts:8` — 可以用 Array.map 替代 for 循环
