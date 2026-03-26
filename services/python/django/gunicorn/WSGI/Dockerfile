# syntax=docker/dockerfile:1.7
ARG PYTHON_VERSION=3.13.12
ARG BASE_BUILDER=slim-bookworm
ARG VENV_PATH=/opt/venv

# ------------ BUILD STAGE -----------------------
FROM python:${PYTHON_VERSION}-${BASE_BUILDER} AS builder

ARG VENV_PATH

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    VIRTUAL_ENV=${VENV_PATH} \
    PATH=${VENV_PATH}/bin:$PATH

WORKDIR /build

# Install build dependencies:
#   gcc/g++  — grpcio / cffi native extensions when no wheel is available
RUN --mount=type=cache,id=django-apt-cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,id=django-apt-lists,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ && \
    rm -rf /var/lib/apt/lists/*


# -- Third-party dependencies (layer cached until requirements.txt changes) --
# Install Python dependencies into a dedicated virtualenv. This keeps runtime
# copies version-agnostic, avoids copying the whole /usr/local/bin tree, and
# mirrors the "copy only the app artifact" approach used by the Go/Java images.
COPY --link gunicorn/WSGI/requirements.txt /build/django-platform/requirements.txt
RUN python -m venv ${VENV_PATH}
RUN --mount=type=cache,id=django-pip-cache,target=/root/.cache/pip,sharing=locked \
    pip install --no-compile -r /build/django-platform/requirements.txt

# -- Common shared package (layer cached until common/ changes) --------------
COPY --link gunicorn/common/ /build/django-common/
RUN pip install --no-compile --no-deps /build/django-common && \
    rm -rf ${VENV_PATH}/lib/python*/site-packages/pip* && \
    rm -f \
      ${VENV_PATH}/bin/activate \
      ${VENV_PATH}/bin/Activate.ps1 \
      ${VENV_PATH}/bin/activate.csh \
      ${VENV_PATH}/bin/activate.fish \
      ${VENV_PATH}/bin/django-admin \
      ${VENV_PATH}/bin/opentelemetry-bootstrap \
      ${VENV_PATH}/bin/opentelemetry-instrument \
      ${VENV_PATH}/bin/pip \
      ${VENV_PATH}/bin/pip3 \
      ${VENV_PATH}/bin/pip3.13 \
      ${VENV_PATH}/bin/sqlformat && \
    python -m compileall -q ${VENV_PATH}

# -- Application source (changes most often) ---------------------------------
# Copy application source
COPY --link gunicorn/WSGI/hello_project/ /build/django-platform/hello_project/
COPY --link gunicorn/WSGI/gunicorn.conf.py /build/django-platform/gunicorn.conf.py
COPY --link gunicorn/WSGI/manage.py /build/django-platform/manage.py

# Run shared unit tests — fail the build if any test breaks.
RUN cd /build/django-platform && \
    OTEL_SDK_DISABLED=true \
    python manage.py test obbench_django_common.tests --verbosity=2

# ------------ RUNTIME STAGE ----------------------
FROM python:${PYTHON_VERSION}-${BASE_BUILDER}

ARG VENV_PATH

ENV DJANGO_SETTINGS_MODULE=hello_project.settings \
    HELLO_VARIANT=platform \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONUNBUFFERED=1 \
    VIRTUAL_ENV=${VENV_PATH} \
    PATH=${VENV_PATH}/bin:$PATH

# Non-root user for security (matches Go/Java distroless nonroot UID=65532)
RUN groupadd -g 65532 nonroot && \
    useradd -u 65532 -g 65532 -d /app -s /sbin/nologin nonroot

WORKDIR /app

# Copy only the virtualenv and application source from the builder.
# This strips gcc/g++ and avoids copying unrelated system-wide scripts.
COPY --from=builder ${VENV_PATH}/ ${VENV_PATH}/

# Copy application source
COPY --from=builder /build/django-platform/hello_project/ /app/hello_project/
COPY --from=builder /build/django-platform/gunicorn.conf.py /app/gunicorn.conf.py
COPY --from=builder /build/django-platform/manage.py /app/manage.py

# Byte-compile all .py files for faster startup
RUN python -m compileall -q /app

USER nonroot:nonroot

EXPOSE 8080

# Gunicorn WSGI server. OTel SDK is initialized programmatically
# per-worker in the post_fork hook (see gunicorn.conf.py / boot.py),
# NOT via the opentelemetry-instrument CLI wrapper, because the CLI
# creates the SDK in the master process and its background export
# threads (BatchSpanProcessor, PeriodicExportingMetricReader) do not
# survive fork().
ENTRYPOINT ["gunicorn", \
    "hello_project.wsgi:application", \
    "--config", "gunicorn.conf.py"]