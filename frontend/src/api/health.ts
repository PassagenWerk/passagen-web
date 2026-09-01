export interface HealthResponse {
  status: "ok";
  database: "available";
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health");
  if (!response.ok) {
    throw new Error(`Health request failed with status ${response.status}`);
  }
  return response.json() as Promise<HealthResponse>;
}
