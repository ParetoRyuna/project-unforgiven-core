#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const storiesDir = path.join(root, 'content-lab', 'stories');
const casesDir = path.join(root, 'content-lab', 'cases');
const dailyLogsDir = path.join(root, 'content-lab', 'daily-logs');
const pressureEventsDir = path.join(root, 'content-lab', 'pressure-events');

function fail(message) {
  console.error(`[content-lab] ${message}`);
  process.exitCode = 1;
}

function validateStoryFiles() {
  if (!fs.existsSync(storiesDir)) return;
  const seriesDirs = fs.readdirSync(storiesDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const series of seriesDirs) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(series.name)) {
      fail(`invalid series_id directory name: ${series.name}`);
      continue;
    }
    const files = fs.readdirSync(path.join(storiesDir, series.name));
    for (const file of files) {
      if (!/^ep-\d{4}\.md$/.test(file)) {
        fail(`invalid story file name: ${series.name}/${file} (expected ep-0001.md)`);
        continue;
      }
      const raw = fs.readFileSync(path.join(storiesDir, series.name, file), 'utf8');
      const frontmatter = raw.startsWith('---\n') ? raw.slice(4).split('\n---\n')[0] : '';
      const requiredKeys = ['id:', 'series_id:', 'title:', 'lang:', 'status:', 'release_at:', 'teaser_only:', 'canon_tags:', 'quiz:'];
      for (const key of requiredKeys) {
        if (!frontmatter.includes(`\n${key}`) && !frontmatter.startsWith(key)) {
          fail(`missing frontmatter key ${key} in ${series.name}/${file}`);
        }
      }
    }
  }
}

function validateCaseFiles() {
  if (!fs.existsSync(casesDir)) return;
  const caseDirs = fs.readdirSync(casesDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const dir of caseDirs) {
    if (!/^case-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(dir.name)) {
      fail(`invalid case_id directory name: ${dir.name}`);
      continue;
    }
    const files = fs.readdirSync(path.join(casesDir, dir.name));
    for (const file of files) {
      if (!/^v\d{3}\.ya?ml$/.test(file)) {
        fail(`invalid case version file: ${dir.name}/${file} (expected v001.yaml)`);
      }
    }
  }
}

function validateDailyLogFiles() {
  if (!fs.existsSync(dailyLogsDir)) return;
  const yearDirs = fs.readdirSync(dailyLogsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const yearDir of yearDirs) {
    if (!/^\d{4}$/.test(yearDir.name)) {
      fail(`invalid daily-log year directory: ${yearDir.name}`);
      continue;
    }
    const files = fs.readdirSync(path.join(dailyLogsDir, yearDir.name));
    for (const file of files) {
      if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(file)) {
        fail(`invalid daily-log file name: ${yearDir.name}/${file}`);
      }
    }
  }
}

function validatePressureEventFiles() {
  if (!fs.existsSync(pressureEventsDir)) return;
  const files = fs.readdirSync(pressureEventsDir);
  for (const file of files) {
    if (!/^evt-\d{8}-[a-z0-9]+(?:-[a-z0-9]+)*\.ya?ml$/.test(file)) {
      fail(`invalid pressure-event file name: ${file}`);
    }
  }
}

validateStoryFiles();
validateCaseFiles();
validateDailyLogFiles();
validatePressureEventFiles();
if (process.exitCode !== 1) {
  console.log('[content-lab] validation passed (manifest generation is manually curated for MVP)');
}
