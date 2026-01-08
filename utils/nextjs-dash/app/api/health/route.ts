import { NextRequest, NextResponse } from 'next/server';

interface ServiceEndpoint {
  name: string;
  url: string;
  timeout?: number;
}

const SERVICE_ENDPOINTS: ServiceEndpoint[] = [
  // Observability Stack
  { name: 'grafana', url: 'http://grafana:3000/api/health', timeout: 5000 },
  { name: 'alloy', url: 'http://alloy:12345/-/ready', timeout: 5000 },
  { name: 'loki', url: 'http://loki:3100/ready', timeout: 5000 },
  { name: 'mimir', url: 'http://mimir:9009/ready', timeout: 5000 },
  { name: 'tempo', url: 'http://tempo:3200/ready', timeout: 5000 },
  { name: 'pyroscope', url: 'http://pyroscope:4040/ready', timeout: 5000 },

  // Spring Services
  { name: 'spring-jvm-tomcat-platform', url: 'http://spring-jvm-tomcat-platform:8080/actuator/health/readiness', timeout: 10000 },
  { name: 'spring-jvm-tomcat-virtual', url: 'http://spring-jvm-tomcat-virtual:8080/actuator/health/readiness', timeout: 10000 },
  { name: 'spring-jvm-netty', url: 'http://spring-jvm-netty:8080/actuator/health/readiness', timeout: 10000 },
  { name: 'spring-native-tomcat-platform', url: 'http://spring-native-tomcat-platform:8080/actuator/health/readiness', timeout: 10000 },
  { name: 'spring-native-tomcat-virtual', url: 'http://spring-native-tomcat-virtual:8080/actuator/health/readiness', timeout: 10000 },
  { name: 'spring-native-netty', url: 'http://spring-native-netty:8080/actuator/health/readiness', timeout: 10000 },

  // Quarkus Services
  { name: 'quarkus-jvm', url: 'http://quarkus-jvm:8080/q/health/ready', timeout: 10000 },
  { name: 'quarkus-native', url: 'http://quarkus-native:8080/q/health/ready', timeout: 10000 },

  // Go Services
  { name: 'go', url: 'http://go:8080/readyz', timeout: 5000 },

  // Utils Services
  { name: 'orchestrator', url: 'http://orchestrator:3002/q/health/ready', timeout: 5000 },
];

// TypeScript
async function checkServiceHealth(service: ServiceEndpoint): Promise<{ name: string; status: 'up' | 'down'; responseTime?: number; statusCode?: number; body?: string; error?: string }> {
  const startTime = Date.now();
  const timeoutMs = service.timeout ?? 10000; // increase default timeout

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(service.url, {
      method: 'GET',
      signal: controller.signal,
      // remove strict Accept if it causes server to behave differently
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;
    const text = await response.text().catch(() => '');

    if (response.ok) {
      return { name: service.name, status: 'up', responseTime, statusCode: response.status, body: text };
    } else {
      return { name: service.name, status: 'down', responseTime, statusCode: response.status, body: text, error: `HTTP ${response.status}` };
    }
  } catch (err: unknown) {
    const responseTime = Date.now() - startTime;
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    const message = err instanceof Error ? err.message : String(err);
    return {
      name: service.name,
      status: 'down',
      responseTime,
      error: isTimeout ? `Timeout after ${timeoutMs}ms` : message,
    };
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const serviceName = searchParams.get('service');
    
    if (serviceName) {
      // Check single service
      const service = SERVICE_ENDPOINTS.find(s => s.name === serviceName);
      if (!service) {
        return NextResponse.json({ error: 'Service not found' }, { status: 404 });
      }
      
      console.log(`[HEALTH API] Checking health of: ${serviceName}`);
      const result = await checkServiceHealth(service);
      return NextResponse.json(result);
    } else {
      // Check all services
      console.log(`[HEALTH API] Checking health of all services`);
      const results = await Promise.all(
        SERVICE_ENDPOINTS.map(service => checkServiceHealth(service))
      );
      
      return NextResponse.json({ services: results });
    }
  } catch (error) {
    console.error('[HEALTH API] Error checking service health:', error);
    return NextResponse.json(
      { error: 'Failed to check service health' },
      { status: 500 }
    );
  }
}
