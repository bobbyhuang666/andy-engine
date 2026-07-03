/**
 * Campus Schedule Presets — configuration + Schedule instance factories
 *
 * `create*ScheduleConfig` 返回纯配置对象 `{ entries: [...] }`。
 * `create*Schedule` 在其基础上返回 `Schedule` 实例(Wave 3c 从 core Schedule.js 迁入)。
 *
 * 依赖方向:preset 可依赖 src/Schedule(具体域 → 通用机制),反向不可以。
 *
 * R13 fix: 区域名必须与 campus domain 的 regions 数组一致。
 * 旧区域名 → 新映射: 住处→宿舍, 餐厅→食堂, 工作区→教室,
 * 阅览室→自习室, 打工处→打工地点, 工作地→办公室
 */

const Schedule = require('../../src/agent/schedule/Schedule');

function createStudentScheduleConfig(options = {}) {
  const {
    morningClass = 8,
    afternoonClass = 14,
    workDays = [1, 3, 5],
    workStart = 17,
    workEnd = 21,
  } = options;

  return {
    entries: [
      { startHour: 7, endHour: 7.5, region: '宿舍', activity: '在洗漱',
        days: [1, 2, 3, 4, 5], probability: 0.95, noise: 15 },
      { startHour: 7.5, endHour: 8, region: '食堂', activity: '在食堂',
        days: [1, 2, 3, 4, 5], probability: 0.6, noise: 20 },
      { startHour: morningClass, endHour: morningClass + 2, region: '教室', activity: '在上课',
        days: [1, 2, 3, 4, 5], probability: 0.85, noise: 10 },
      { startHour: morningClass + 2.5, endHour: morningClass + 4.5, region: '教室', activity: '在上课',
        days: [1, 2, 3, 4, 5], probability: 0.8, noise: 10 },
      { startHour: 12, endHour: 13, region: '食堂', activity: '在食堂',
        days: [0, 1, 2, 3, 4, 5, 6], probability: 0.9, noise: 30 },
      { startHour: 13, endHour: 14, region: '宿舍', activity: '先躺一会',
        days: [1, 2, 3, 4, 5], probability: 0.5, noise: 20 },
      { startHour: afternoonClass, endHour: afternoonClass + 2, region: '教室', activity: '在上课',
        days: [1, 2, 3, 4], probability: 0.75, noise: 15 },
      { startHour: afternoonClass + 2, endHour: 17, region: '自习室', activity: '在自习',
        days: [1, 2, 3, 4, 5], probability: 0.5, noise: 30 },
      { startHour: workStart, endHour: workEnd, region: '打工地点', activity: '在打工',
        days: workDays, probability: 0.9, noise: 15 },
      { startHour: 18, endHour: 19, region: '食堂', activity: '在食堂',
        days: [0, 2, 4, 6], probability: 0.7, noise: 30 },
    ],
  };
}

function createWorkerScheduleConfig(options = {}) {
  const { workStart = 9, workEnd = 18 } = options;

  return {
    entries: [
      { startHour: 7, endHour: 7.5, region: '宿舍', activity: '在洗漱',
        days: [1, 2, 3, 4, 5], probability: 0.95, noise: 15 },
      { startHour: 8, endHour: 8.5, region: '路上', activity: '在路上',
        days: [1, 2, 3, 4, 5], probability: 0.9, noise: 20 },
      { startHour: workStart, endHour: 12, region: '办公室', activity: '在工作',
        days: [1, 2, 3, 4, 5], probability: 0.95, noise: 10 },
      { startHour: 12, endHour: 13, region: '食堂', activity: '在食堂',
        days: [1, 2, 3, 4, 5], probability: 0.8, noise: 20 },
      { startHour: 13, endHour: workEnd, region: '办公室', activity: '在工作',
        days: [1, 2, 3, 4, 5], probability: 0.95, noise: 10 },
      { startHour: 19, endHour: 20, region: '宿舍', activity: '在做饭',
        days: [0, 1, 2, 3, 4, 5, 6], probability: 0.6, noise: 30 },
    ],
  };
}

function createFreelancerScheduleConfig(options = {}) {
  return {
    entries: [
      { startHour: 9, endHour: 10, region: '宿舍', activity: '在洗漱',
        days: [0, 1, 2, 3, 4, 5, 6], probability: 0.7, noise: 60 },
      { startHour: 10, endHour: 12, region: '宿舍', activity: '在工作',
        days: [1, 2, 3, 4, 5], probability: 0.7, noise: 60 },
      { startHour: 12, endHour: 13, region: '食堂', activity: '在食堂',
        days: [0, 1, 2, 3, 4, 5, 6], probability: 0.8, noise: 30 },
      { startHour: 14, endHour: 18, region: '咖啡店', activity: '在工作',
        days: [1, 2, 3, 4, 5], probability: 0.6, noise: 60 },
      { startHour: 19, endHour: 20, region: '宿舍', activity: '在做饭',
        days: [0, 1, 2, 3, 4, 5, 6], probability: 0.5, noise: 30 },
    ],
  };
}

function createHomeScheduleConfig(options = {}) {
  return {
    entries: [
      { startHour: 6, endHour: 7, region: '宿舍', activity: '在洗漱',
        days: [0, 1, 2, 3, 4, 5, 6], probability: 0.8, noise: 30 },
      { startHour: 7, endHour: 8, region: '宿舍', activity: '在做饭',
        days: [0, 1, 2, 3, 4, 5, 6], probability: 0.7, noise: 30 },
      { startHour: 9, endHour: 11, region: '公园', activity: '在公园',
        days: [0, 1, 2, 3, 4, 5, 6], probability: 0.5, noise: 60 },
      { startHour: 12, endHour: 13, region: '宿舍', activity: '在吃饭',
        days: [0, 1, 2, 3, 4, 5, 6], probability: 0.8, noise: 20 },
      { startHour: 14, endHour: 16, region: '宿舍', activity: '在看剧',
        days: [0, 1, 2, 3, 4, 5, 6], probability: 0.6, noise: 60 },
    ],
  };
}


// ═══════════════════════════════════════════
// Schedule instance factories (migrated from core Schedule.js — Wave 3c)
//
// Core Schedule 类不再内置 campus 预设;这些工厂由 preset 模块提供,
// 调用方(入口层 / 测试 / 脚本)按需引用。preset 可依赖 src,反向不可以。
// ═══════════════════════════════════════════

function createStudentSchedule(options = {}) {
  return new Schedule(createStudentScheduleConfig(options));
}

function createWorkerSchedule(options = {}) {
  return new Schedule(createWorkerScheduleConfig(options));
}

function createFreelancerSchedule(options = {}) {
  return new Schedule(createFreelancerScheduleConfig(options));
}

function createHomeSchedule(options = {}) {
  return new Schedule(createHomeScheduleConfig(options));
}

module.exports = {
  createStudentScheduleConfig,
  createWorkerScheduleConfig,
  createFreelancerScheduleConfig,
  createHomeScheduleConfig,
  createStudentSchedule,
  createWorkerSchedule,
  createFreelancerSchedule,
  createHomeSchedule,
};
