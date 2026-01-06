# Observability Benchmarking Dashboard

A Next.js-based dashboard for orchestrating and managing the Observability Benchmarking environment.

## Features

- **Environment Configuration Editor**: Edit the `compose/.env` file through an intuitive UI
- **Script Runner**: Execute IntelliJ IDEA run configurations from the `.run` directory
- **Professional UI**: Built with Material-UI v7.3.6 for a polished interface
- **Docker Support**: Runs in its own containerized environment

## Technology Stack

- **Next.js**: v16.1.1
- **React**: v19.2.3
- **Material-UI (MUI)**: v7.3.6
- **TypeScript**: v5
- **Node.js**: v25

## Development

### Prerequisites

- Node.js 22 or higher
- npm or yarn

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. (Optional) Update dependency versions to the latest (including majors), then reinstall:
   ```bash
   npx npm-check-updates -u
   npm install
   ```
This updates package.json and refreshes package-lock.json.

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3001](http://localhost:3001) in your browser

### Building for Production

```bash
npm run build
npm start
```

## Docker Deployment

The dashboard is designed to run in a Docker container alongside the observability stack.

**Note**: Due to npm ci timeout issues in resource-constrained CI environments, it's recommended to build locally first or use the development mode.

### Option 1: Use Docker Compose (Recommended for local development)

The dashboard service is already configured in `compose/docker-compose.yml` and will start with the OBS profile:

```bash
docker compose --project-directory compose up nextjs-dash --build -d
```

Access the dashboard at [http://localhost:3001](http://localhost:3001)

### Option 2: Build the Docker image manually:

```bash
docker buildx build --load -t nextjs-dash:latest -f utils/nextjs-dash/Dockerfile .
```

### Option 3: Run the container:

```bash
docker run -p 3001:3001 \
  -v $(pwd)/../compose/.env:/app/compose/.env \
  -v $(pwd)/../.run:/app/.run \
  nextjs-dash:latest
```

### Using Docker Compose

Add the following service to your `docker-compose.yml` (already included in this project):

```yaml
services:
   nextjs-dash:
    build:
      context: ./dashboard
      dockerfile: Dockerfile
    container_name: nextjs-dash
    ports:
      - "3001:3001"
    volumes:
      - ./compose/.env:/app/compose/.env
      - ./.run:/app/.run:ro
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - NODE_ENV=production
    restart: unless-stopped
```

Then start the dashboard:

```bash
docker compose up nextjs-dash -d
```

## Usage

### Environment Configuration

1. Navigate to the **Environment Configuration** tab
2. Edit any configuration values
3. Click **Save Changes** to update the `compose/.env` file
4. A backup is automatically created before each save

### Script Runner

1. Navigate to the **Script Runner** tab
2. View all available scripts from the `.run` directory
3. Click **Execute** on any script to run it
4. View the output in the dialog that appears

## Security Considerations

- The dashboard currently has no authentication (suitable for local development)
- Script execution is limited to `docker compose` and `mvn` commands
- File operations are restricted to the `.env` file
- Consider adding authentication before deploying to production

## Future Enhancements

- Add authentication/authorization
- Real-time log streaming from executed scripts
- Environment variable validation
- Script scheduling and history
- Container status monitoring
- Resource usage visualization

## License

Apache License 2.0 (same as parent project)
