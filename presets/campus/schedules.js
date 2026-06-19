/**
 * Campus Schedule Presets — pure configuration factories
 *
 * Returns plain config objects `{ entries: [...] }`.
 * No dependency on Agent or Schedule class.
 *
 * Legacy compatibility wrappers in agent/Schedule.js call these lazily.
 */

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
      { startHour: 7, endHour: 7.5, region: '住处', activity: '在洗漱',
        days: [1, 2, 3, 4, 5], probability: 0.95, noise: 15 },
      { startHour: 7.5, endHour: 8, region: '餐厅', activity: '在餐厅',
        days: [1, 2, 3, 4, 5], probability: 0.6, noise: 20 },
      { startHour: morningClass, endHour: morningClass + 2, region: '工作区', activity: '在工作',
        days: [1, 2, 3, 4, 5], probability: 0.85, noise: 10 },
      { startHour: morningClass + 2.5, endHour: morningClass + 4.5, region: '工作区', activity: '在工作',
        days: [1, 2, 3, 4, 5], probability: 0.8, noise: 10 },
      { startHour: 12, endHour: 13, region: '餐厅', activity: '在餐厅',
        days: [0, 1, 2, 3, 4, 5, 6], probability: 0.9, noise: 30 },
      { startHour: 13, endHour: 14, region: '住处', activity: '先躺一会',
        days: [1, 2, 3, 4, 5], probability: 0.5, noise: 20 },
      { startHour: afternoonClass, endHour: afternoonClass + 2, region: '工作区', activity: '在工作',
        days: [1, 2, 3, 4], probability: 0.75, noise: 15 },
      { startHour: afternoonClass + 2, endHour: 17, region: '阅览室', activity: '在专注做事',
        days: [1, 2, 3, 4, 5], probability: 0.5, noise: 30 },
      { startHour: workStart, endHour: workEnd, region: '打工处', activity: '在打工',
        days: workDays, probability: 0.9, noise: 15 },
      { startHour: 18, endHour: 19, region: '餐厅', activity: '在餐厅',
        days: [0, 2, 4, 6], probability: 0.7, noise: 30 },
    ],
  };
}

function createWorkerScheduleConfig(options = {}) {
  const { workStart = 9, workEnd = 18 } = options;

  return {
    entries: [
      { startHour: 7, endHour: 7.5, region: '家', activity: '在洗漱',
        days: [1, 2, 3, 4, 5], probability: 0.95, noise: 15 },
      { startHour: 8, endHour: 8.5, region: '路上', activity: '在路上',
        days: [1, 2, 3, 4, 5], probability: 0.9, noise: 20 },
      { startHour: workStart, endHour: 12, region: '工作地', activity: '在工作',
        days: [1, 2, 3, 4, 5], probability: 0.95, noise: 10 },
      { startHour: 12, endHour: 13, region: '餐厅', activity: '在餐厅',
        days: [1, 2, 3, 4, 5], probability: 0.8, noise: 20 },
      { startHour: 13, endHour: workEnd, region: '工作地', activity: '在工作',
        days: [1, 2, 3, 4, 5], probability: 0.95, noise: 10 },
      { startHour: 19, endHour: 20, region: '家', activity: '在做饭',
        days: [0, 1, 2, 3, 4, 5, 6], probability: 0.6, noise: 30 },
    ],
  };
}

function createFreelancerScheduleConfig(options = {}) {
  return {
    entries: [
      { startHour: 9, endHour: 10, region: '家', activity: '在洗漱',
        days: [0, 1, 2, 3, 4, 5, 6], probability: 0.7, noise: 60 },
      { startHour: 10, endHour: 12, region: '家', activity: '在工作',
        days: [1, 2, 3, 4, 5], probability: 0.7, noise: 60 },
      { startHour: 12, endHour: 13, region: '餐厅', activity: '在餐厅',
        days: [0, 1, 2, 3, 4, 5, 6], probability: 0.8, noise: 30 },
      { startHour: 14, endHour: 18, region: '咖啡店', activity: '在工作',
        days: [1, 2, 3, 4, 5], probability: 0.6, noise: 60 },
      { startHour: 19, endHour: 20, region: '家', activity: '在做饭',
        days: [0, 1, 2, 3, 4, 5, 6], probability: 0.5, noise: 30 },
    ],
  };
}

function createHomeScheduleConfig(options = {}) {
  return {
    entries: [
      { startHour: 6, endHour: 7, region: '家', activity: '在洗漱',
        days: [0, 1, 2, 3, 4, 5, 6], probability: 0.8, noise: 30 },
      { startHour: 7, endHour: 8, region: '家', activity: '在做饭',
        days: [0, 1, 2, 3, 4, 5, 6], probability: 0.7, noise: 30 },
      { startHour: 9, endHour: 11, region: '公园', activity: '在散步',
        days: [0, 1, 2, 3, 4, 5, 6], probability: 0.5, noise: 60 },
      { startHour: 12, endHour: 13, region: '家', activity: '在吃饭',
        days: [0, 1, 2, 3, 4, 5, 6], probability: 0.8, noise: 20 },
      { startHour: 14, endHour: 16, region: '家', activity: '在看剧',
        days: [0, 1, 2, 3, 4, 5, 6], probability: 0.6, noise: 60 },
    ],
  };
}

module.exports = {
  createStudentScheduleConfig,
  createWorkerScheduleConfig,
  createFreelancerScheduleConfig,
  createHomeScheduleConfig,
};
