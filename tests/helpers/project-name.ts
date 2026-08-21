export function getTestProjectName(): string {
  const projectName = process.env.PROJECT_NAME;
  if (!projectName) throw new Error("PROJECT_NAME is required for tests");
  return projectName;
}