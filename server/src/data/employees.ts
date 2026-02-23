/**
 * Employees are now stored in the database (reimbursement_users with xp, level, status, job_title).
 * Use db/employeesDb.js for getEmployeeById, getEmployeeByEmail, getEmployeesByDepartment,
 * getEmployeesByRole, addEmployeeXP, getEmployeeByIdAsUser, getEmployeesAsUsers, updateEmployeeStatus.
 */
export {
  getEmployeeById,
  getEmployeeByEmail,
  getEmployeesByDepartment,
  getEmployeesByRole,
  addEmployeeXP,
  getEmployeeByIdAsUser,
  getEmployeesAsUsers,
  updateEmployeeStatus,
} from '../db/employeesDb.js';
