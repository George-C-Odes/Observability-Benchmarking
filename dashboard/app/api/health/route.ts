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
  { name: 'spring-jvm-tomcat-platform', url: 'http://spring-jvm-tomcat-platform:8080/actuator/health/readiness', timeout: 3000 },
  { name: 'spring-jvm-tomcat-virtual', url: 'http://spring-jvm-tomcat-virtual:8081/actuator/health/readiness', timeout: 3000 },
  { name: 'spring-jvm-netty', url: 'http://spring-jvm-netty:8082/actuator/health/readiness', timeout: 3000 },
  
  // Quarkus Services
  { name: 'quarkus-jvm', url: 'http://quarkus-jvm:8090/q/health/ready', timeout: 3000 },
  { name: 'quarkus-native', url: 'http://quarkus-native:8091/q/health/ready', timeout: 3000 },
];

async function checkServiceHealth(service: ServiceEndpoint): Promise<{ name: string; status: 'up' | 'down'; responseTime?: number; error?: string }> {
  const startTime = Date.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), service.timeout || 5000);
    
    const response = await fetch(service.url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    
    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;
    
    if (response.ok || response.status === 200 || response.status === 204) {
      return { name: service.name, status: 'up', responseTime };
    } else {
      return { name: service.name, status: 'down', responseTime, error: `HTTP ${response.status}` };
    }
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    return { 
      name: service.name, 
      status: 'down', 
      responseTime,
      error: error.name === 'AbortError' ? 'Timeout' : error.message 
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
