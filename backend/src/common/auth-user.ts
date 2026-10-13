export interface AuthUser {
  id: string;
  login: string;
  fullName: string;
  employeeId: string | null;
  roles: string[];
  permissions: string[];
  /** null — доступ ко всем подразделениям; иначе — список разрешённых подразделений (включая дочерние) */
  unitIds: string[] | null;
}
