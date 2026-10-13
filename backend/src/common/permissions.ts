/**
 * Каталог разрешений (RBAC). Набор разрешений ролей хранится в БД и может изменяться администратором;
 * здесь определены коды, используемые в проверках на сервере, и стартовое распределение по ролям.
 */
export const PERMISSIONS = {
  // Администрирование
  USERS_MANAGE: 'users.manage',
  ROLES_MANAGE: 'roles.manage',
  SETTINGS_MANAGE: 'settings.manage',
  AUDIT_READ: 'audit.read',
  BACKUP_MANAGE: 'backup.manage',
  ORG_MANAGE: 'org.manage',
  SAFETY_REFS_MANAGE: 'safety_refs.manage',
  TEMPLATES_MANAGE: 'templates.manage',
  // Сотрудники
  EMPLOYEES_READ: 'employees.read',
  EMPLOYEES_WRITE: 'employees.write',
  EMPLOYEES_IMPORT: 'employees.import',
  EMPLOYEES_TRANSFER: 'employees.transfer',
  EMPLOYEES_DISMISS: 'employees.dismiss',
  // Инструктажи
  BRIEFINGS_READ: 'briefings.read',
  BRIEFINGS_PLAN: 'briefings.plan',
  BRIEFINGS_CONDUCT: 'briefings.conduct',
  // Проверки знаний
  CHECKS_READ: 'checks.read',
  CHECKS_PLAN: 'checks.plan',
  CHECKS_CONDUCT: 'checks.conduct',
  // СИЗ
  PPE_READ: 'ppe.read',
  PPE_ISSUE: 'ppe.issue',
  PPE_NORMS_MANAGE: 'ppe.norms.manage',
  PPE_STOCK: 'ppe.stock',
  // Задачи, календарь, отчёты
  TASKS_READ: 'tasks.read',
  TASKS_MANAGE: 'tasks.manage',
  CALENDAR_READ: 'calendar.read',
  DASHBOARD_READ: 'dashboard.read',
  REPORTS_READ: 'reports.read',
  REPORTS_EXPORT: 'reports.export',
  ATTACHMENTS_UPLOAD: 'attachments.upload',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_CATALOG: { code: PermissionCode; name: string; group: string }[] = [
  { code: 'users.manage', name: 'Управление пользователями', group: 'Администрирование' },
  { code: 'roles.manage', name: 'Управление ролями и разрешениями', group: 'Администрирование' },
  { code: 'settings.manage', name: 'Настройки системы и правила уведомлений', group: 'Администрирование' },
  { code: 'audit.read', name: 'Просмотр журнала действий', group: 'Администрирование' },
  { code: 'backup.manage', name: 'Резервное копирование', group: 'Администрирование' },
  { code: 'org.manage', name: 'Справочники подразделений и должностей', group: 'Справочники' },
  { code: 'safety_refs.manage', name: 'Справочники ОТ: виды, правила, документы, комиссии', group: 'Справочники' },
  { code: 'templates.manage', name: 'Шаблоны печатных форм', group: 'Справочники' },
  { code: 'employees.read', name: 'Просмотр сотрудников', group: 'Сотрудники' },
  { code: 'employees.write', name: 'Создание и редактирование кадровых данных', group: 'Сотрудники' },
  { code: 'employees.import', name: 'Импорт сотрудников', group: 'Сотрудники' },
  { code: 'employees.transfer', name: 'Перевод сотрудников', group: 'Сотрудники' },
  { code: 'employees.dismiss', name: 'Приём / увольнение', group: 'Сотрудники' },
  { code: 'briefings.read', name: 'Просмотр инструктажей', group: 'Инструктажи' },
  { code: 'briefings.plan', name: 'Планирование инструктажей', group: 'Инструктажи' },
  { code: 'briefings.conduct', name: 'Регистрация проведения инструктажей', group: 'Инструктажи' },
  { code: 'checks.read', name: 'Просмотр проверок знаний', group: 'Проверки знаний' },
  { code: 'checks.plan', name: 'Планирование проверок знаний', group: 'Проверки знаний' },
  { code: 'checks.conduct', name: 'Регистрация результатов проверок', group: 'Проверки знаний' },
  { code: 'ppe.read', name: 'Просмотр СИЗ', group: 'СИЗ' },
  { code: 'ppe.issue', name: 'Выдача, возврат, списание СИЗ', group: 'СИЗ' },
  { code: 'ppe.norms.manage', name: 'Справочник и нормы СИЗ', group: 'СИЗ' },
  { code: 'ppe.stock', name: 'Складские остатки СИЗ', group: 'СИЗ' },
  { code: 'tasks.read', name: 'Просмотр задач', group: 'Задачи' },
  { code: 'tasks.manage', name: 'Создание и изменение задач', group: 'Задачи' },
  { code: 'calendar.read', name: 'Календарь мероприятий', group: 'Задачи' },
  { code: 'dashboard.read', name: 'Главная панель', group: 'Отчёты' },
  { code: 'reports.read', name: 'Просмотр отчётов', group: 'Отчёты' },
  { code: 'reports.export', name: 'Экспорт и печать отчётов', group: 'Отчёты' },
  { code: 'attachments.upload', name: 'Загрузка файлов', group: 'Файлы' },
];

const ALL = PERMISSION_CATALOG.map((p) => p.code);
const READS: PermissionCode[] = [
  'employees.read', 'briefings.read', 'checks.read', 'ppe.read', 'tasks.read', 'calendar.read',
  'dashboard.read', 'reports.read', 'reports.export',
];

export const ROLE_DEFAULTS: { code: string; name: string; description: string; permissions: PermissionCode[] }[] = [
  { code: 'ADMIN', name: 'Системный администратор', description: 'Пользователи, роли, настройки, справочники, журнал, резервные копии', permissions: ALL },
  {
    code: 'SAFETY_SPECIALIST', name: 'Специалист по охране труда', description: 'Инструктажи, проверки знаний, СИЗ, контроль сроков, отчёты',
    permissions: [...READS, 'briefings.plan', 'briefings.conduct', 'checks.plan', 'checks.conduct', 'ppe.issue', 'ppe.norms.manage', 'ppe.stock',
      'tasks.manage', 'safety_refs.manage', 'templates.manage', 'attachments.upload'],
  },
  { code: 'UNIT_HEAD', name: 'Руководитель подразделения', description: 'Просмотр сотрудников, мероприятий и отчётов своего подразделения', permissions: [...READS] },
  {
    code: 'HR', name: 'Кадровый специалист', description: 'Импорт, приём, перевод, увольнение сотрудников',
    permissions: ['employees.read', 'employees.write', 'employees.import', 'employees.transfer', 'employees.dismiss', 'org.manage', 'dashboard.read', 'attachments.upload'],
  },
  {
    code: 'PPE_OFFICER', name: 'Ответственный за выдачу СИЗ', description: 'Выдача, возврат, остатки и потребность в СИЗ',
    permissions: ['employees.read', 'ppe.read', 'ppe.issue', 'ppe.stock', 'calendar.read', 'dashboard.read', 'reports.read', 'reports.export', 'tasks.read', 'attachments.upload'],
  },
  { code: 'AUDITOR', name: 'Аудитор', description: 'Только просмотр разрешённых данных и отчётов', permissions: [...READS, 'audit.read'] },
];
