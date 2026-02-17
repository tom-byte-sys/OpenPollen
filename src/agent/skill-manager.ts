import { existsSync, readdirSync, readFileSync, mkdirSync, cpSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { execSync } from 'node:child_process';
import { getLogger } from '../utils/logger.js';

const log = getLogger('skill-manager');

export interface SkillInfo {
  name: string;
  description: string;
  allowedTools: string;
  directory: string;
  source: SkillSource;
}

export interface SkillSource {
  type: 'marketplace' | 'git' | 'local';
  version?: string;
  url?: string;
  skillId?: string;
}

interface SkillFrontmatter {
  name: string;
  description: string;
  'allowed-tools'?: string;
  context?: string;
  'disable-model-invocation'?: boolean;
}

export class SkillManager {
  private skillsDir: string;
  private skills = new Map<string, SkillInfo>();

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
    if (!existsSync(this.skillsDir)) {
      mkdirSync(this.skillsDir, { recursive: true });
    }
  }

  /**
   * 扫描技能目录，发现所有已安装技能
   */
  discover(): SkillInfo[] {
    this.skills.clear();

    if (!existsSync(this.skillsDir)) return [];

    const entries = readdirSync(this.skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillDir = resolve(this.skillsDir, entry.name);
      const skillMdPath = join(skillDir, 'SKILL.md');

      if (!existsSync(skillMdPath)) {
        log.debug({ skill: entry.name }, '未找到 SKILL.md，跳过');
        continue;
      }

      try {
        const content = readFileSync(skillMdPath, 'utf-8');
        const frontmatter = this.parseFrontmatter(content);

        if (!frontmatter.name || !frontmatter.description) {
          log.warn({ skill: entry.name }, 'SKILL.md frontmatter 不完整');
          continue;
        }

        // 读取来源信息
        const sourcePath = join(skillDir, '.source.json');
        let source: SkillSource = { type: 'local' };
        if (existsSync(sourcePath)) {
          source = JSON.parse(readFileSync(sourcePath, 'utf-8')) as SkillSource;
        }

        const info: SkillInfo = {
          name: frontmatter.name,
          description: frontmatter.description,
          allowedTools: frontmatter['allowed-tools'] ?? '',
          directory: skillDir,
          source,
        };

        this.skills.set(info.name, info);
        log.debug({ skill: info.name }, '技能已发现');
      } catch (error) {
        log.error({ skill: entry.name, error }, '解析 SKILL.md 失败');
      }
    }

    log.info({ count: this.skills.size }, '技能扫描完成');
    return this.list();
  }

  /**
   * 从本地路径安装技能
   */
  installFromLocal(sourcePath: string): SkillInfo {
    const resolvedPath = resolve(sourcePath);
    const skillMdPath = join(resolvedPath, 'SKILL.md');

    if (!existsSync(skillMdPath)) {
      throw new Error(`未找到 SKILL.md: ${skillMdPath}`);
    }

    const content = readFileSync(skillMdPath, 'utf-8');
    const frontmatter = this.parseFrontmatter(content);
    const name = frontmatter.name || basename(resolvedPath);

    const targetDir = resolve(this.skillsDir, name);
    if (existsSync(targetDir)) {
      throw new Error(`技能已存在: ${name}`);
    }

    cpSync(resolvedPath, targetDir, { recursive: true });

    // 写入来源信息
    const source: SkillSource = { type: 'local' };
    writeFileSync(join(targetDir, '.source.json'), JSON.stringify(source, null, 2));

    log.info({ skill: name, from: resolvedPath }, '技能已安装（本地）');

    // 重新发现
    this.discover();
    return this.skills.get(name)!;
  }

  /**
   * 从 Git URL 安装技能
   */
  installFromGit(url: string): SkillInfo {
    // 从 URL 提取技能名 (最后一段路径去掉 .git)
    const urlPath = url.replace(/\.git$/, '');
    const name = basename(urlPath);
    const targetDir = resolve(this.skillsDir, name);

    if (existsSync(targetDir)) {
      throw new Error(`技能已存在: ${name}`);
    }

    // git clone 到技能目录
    try {
      execSync(`git clone --depth 1 ${url} ${targetDir}`, { stdio: 'pipe' });
    } catch (error) {
      // 清理可能的残留目录
      if (existsSync(targetDir)) {
        rmSync(targetDir, { recursive: true, force: true });
      }
      throw new Error(`Git clone 失败: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 验证 SKILL.md 存在
    const skillMdPath = join(targetDir, 'SKILL.md');
    if (!existsSync(skillMdPath)) {
      rmSync(targetDir, { recursive: true, force: true });
      throw new Error(`仓库中未找到 SKILL.md: ${url}`);
    }

    // 删除 .git 目录（不需要保留版本历史）
    const gitDir = join(targetDir, '.git');
    if (existsSync(gitDir)) {
      rmSync(gitDir, { recursive: true, force: true });
    }

    // 写入来源信息
    const source: SkillSource = { type: 'git', url };
    writeFileSync(join(targetDir, '.source.json'), JSON.stringify(source, null, 2));

    log.info({ skill: name, from: url }, '技能已安装（Git）');

    this.discover();
    return this.skills.get(name)!;
  }

  /**
   * 从市场安装技能（tar.gz 包）
   */
  installFromMarketplace(name: string, packageData: Buffer, version: string, skillId: string): SkillInfo {
    const targetDir = resolve(this.skillsDir, name);
    if (existsSync(targetDir)) {
      throw new Error(`技能已存在: ${name}`);
    }

    mkdirSync(targetDir, { recursive: true });

    // 解压 tar.gz 到技能目录
    try {
      const tarPath = join(targetDir, '_package.tar.gz');
      writeFileSync(tarPath, packageData);
      execSync(`tar -xzf ${tarPath} -C ${targetDir}`, { stdio: 'pipe' });
      // 清理临时文件
      if (existsSync(tarPath)) {
        rmSync(tarPath);
      }
    } catch (error) {
      // 清理残留
      if (existsSync(targetDir)) {
        rmSync(targetDir, { recursive: true, force: true });
      }
      throw new Error(`解压包失败: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 验证 SKILL.md 存在
    const skillMdPath = join(targetDir, 'SKILL.md');
    if (!existsSync(skillMdPath)) {
      rmSync(targetDir, { recursive: true, force: true });
      throw new Error(`包中未找到 SKILL.md`);
    }

    // 写入来源信息
    const source: SkillSource = { type: 'marketplace', version, skillId };
    writeFileSync(join(targetDir, '.source.json'), JSON.stringify(source, null, 2));

    log.info({ skill: name, version, skillId }, '技能已安装（市场）');

    this.discover();
    return this.skills.get(name)!;
  }

  /**
   * 更新技能（仅支持 Git 来源）
   */
  update(name: string): SkillInfo {
    const skill = this.skills.get(name);
    if (!skill) {
      throw new Error(`技能未找到: ${name}`);
    }

    if (skill.source.type !== 'git' || !skill.source.url) {
      throw new Error(`技能 ${name} 不是从 Git 安装的，无法自动更新`);
    }

    const url = skill.source.url;
    // 先删除再重新安装
    this.remove(name);
    return this.installFromGit(url);
  }

  /**
   * 卸载技能
   */
  remove(name: string): void {
    const skill = this.skills.get(name);
    if (!skill) {
      throw new Error(`技能未找到: ${name}`);
    }

    rmSync(skill.directory, { recursive: true, force: true });
    this.skills.delete(name);
    log.info({ skill: name }, '技能已卸载');
  }

  /**
   * 列出所有已安装技能
   */
  list(): SkillInfo[] {
    return Array.from(this.skills.values());
  }

  /**
   * 获取技能信息
   */
  get(name: string): SkillInfo | undefined {
    return this.skills.get(name);
  }

  /**
   * 获取技能的完整 SKILL.md 内容
   */
  getSkillContent(name: string): string | null {
    const skill = this.skills.get(name);
    if (!skill) return null;

    const skillMdPath = join(skill.directory, 'SKILL.md');
    if (!existsSync(skillMdPath)) return null;

    return readFileSync(skillMdPath, 'utf-8');
  }

  /**
   * 将所有技能内容合并为系统提示的一部分
   */
  buildSkillsPrompt(): string {
    const skills = this.list();
    if (skills.length === 0) return '';

    const parts: string[] = [
      '\n\n## Available Skills',
      'The following skills are available. When a user request matches a skill, follow its instructions.',
      '',
    ];

    for (const skill of skills) {
      const content = this.getSkillContent(skill.name);
      if (!content) continue;

      // 去掉 frontmatter，只保留正文
      const body = content.replace(/^---\n[\s\S]*?\n---\n*/, '').trim();
      parts.push(`### Skill: ${skill.name}`);
      parts.push(`**Description:** ${skill.description}`);
      if (skill.allowedTools) {
        parts.push(`**Allowed tools:** ${skill.allowedTools}`);
      }
      parts.push('');
      parts.push(body);
      parts.push('');
    }

    return parts.join('\n');
  }

  /**
   * 创建新技能脚手架
   */
  create(name: string): string {
    const targetDir = resolve(this.skillsDir, name);
    if (existsSync(targetDir)) {
      throw new Error(`技能已存在: ${name}`);
    }

    mkdirSync(targetDir, { recursive: true });
    mkdirSync(join(targetDir, 'examples'), { recursive: true });

    const skillMd = `---
name: ${name}
description: 在此填写技能描述
allowed-tools: Read, Grep, Glob
---

# ${name}

在此编写技能指令...

## 使用场景

当用户要求 ... 时使用此技能。

## 输出格式

- 按照 Markdown 格式输出结果
`;

    writeFileSync(join(targetDir, 'SKILL.md'), skillMd);
    writeFileSync(
      join(targetDir, '.source.json'),
      JSON.stringify({ type: 'local' } as SkillSource, null, 2),
    );

    log.info({ skill: name }, '技能脚手架已创建');
    return targetDir;
  }

  /**
   * 解析 YAML frontmatter
   */
  private parseFrontmatter(content: string): SkillFrontmatter {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return { name: '', description: '' };

    const yaml = match[1];
    const result: Record<string, string | boolean> = {};

    for (const line of yaml.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      let value: string | boolean = line.slice(colonIdx + 1).trim();
      if (value === 'true') value = true;
      if (value === 'false') value = false;
      result[key] = value;
    }

    return result as unknown as SkillFrontmatter;
  }
}
