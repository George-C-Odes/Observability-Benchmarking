# syntax=docker/dockerfile:1.7
ARG PYTHON_VERSION=3.13.13
ARG BASE_BUILDER=slim-bookworm
ARG VENV_PATH=/opt/venv

# ------------ BUILD STAGE -----------------------
FROM python:${PYTHON_VERSION}-${BASE_BUILDER} AS builder

ARG VENV_PATH

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    VIRTUAL_ENV=${VENV_PATH} \
    PATH=${VENV_PATH}/bin:$PATH

WORKDIR /build

RUN --mount=type=cache,id=django-reactive-apt-cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,id=django-reactive-apt-lists,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ && \
    rm -rf /var/lib/apt/lists/*

# -- Third-party dependencies (layer cached until requirements.txt changes) --
COPY --link gunicorn/ASGI/requirements.txt /build/django-reactive/requirements.txt
RUN python -m venv ${VENV_PATH}
RUN --mount=type=cache,id=django-reactive-pip-cache,target=/root/.cache/pip,sharing=locked \
    pip install --no-compile -r /build/django-reactive/requirements.txt

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
COPY --link gunicorn/ASGI/hello_project/ /build/django-reactive/hello_project/
COPY --link gunicorn/ASGI/gunicorn.conf.py /build/django-reactive/gunicorn.conf.py
COPY --link gunicorn/ASGI/manage.py /build/django-reactive/manage.py

# Run shared unit tests — fail the build if any test breaks.
RUN cd /build/django-reactive && \
    OTEL_SDK_DISABLED=true \
    python manage.py test obbench_django_common.tests --verbosity=2

# ------------ RUNTIME STAGE ----------------------
FROM python:${PYTHON_VERSION}-${BASE_BUILDER}

ARG VENV_PATH

ENV DJANGO_SETTINGS_MODULE=hello_project.settings \
    HELLO_VARIANT=reactive \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONUNBUFFERED=1 \
    VIRTUAL_ENV=${VENV_PATH} \
    PATH=${VENV_PATH}/bin:$PATH

RUN groupadd -g 65532 nonroot && \
    useradd -u 65532 -g 65532 -d /app -s /sbin/nologin nonroot

WORKDIR /app

COPY --from=builder ${VENV_PATH}/ ${VENV_PATH}/
COPY --from=builder /build/django-reactive/hello_project/ /app/hello_project/
COPY --from=builder /build/django-reactive/gunicorn.conf.py /app/gunicorn.conf.py
COPY --from=builder /build/django-reactive/manage.py /app/manage.py

RUN python -m compileall -q /app

USER nonroot:nonroot

EXPOSE 8080

ENTRYPOINT ["gunicorn", \
    "hello_project.asgi:application", \
    "--config", "gunicorn.conf.py"]