# 一次性验收服务：pytest（算法判据）→ Vitest（组件）→ Playwright（真实联调）
FROM mcr.microsoft.com/playwright:v1.48.2-jammy

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv curl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}" \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /verify

# API 依赖与测试
COPY api/requirements.txt api/requirements-dev.txt /verify/api/
RUN pip install --no-cache-dir \
      -r /verify/api/requirements.txt \
      -r /verify/api/requirements-dev.txt
COPY api/ /verify/api/

# Web 依赖与测试（Vitest + Playwright）
COPY web/package.json web/package-lock.json /verify/web/
RUN cd /verify/web && npm ci
COPY web/ /verify/web/

COPY verify/run_verify.sh /verify/run_verify.sh
RUN chmod +x /verify/run_verify.sh

ENV API_BASE_URL=http://api:8000 \
    WEB_BASE_URL=http://web \
    CI=1

CMD ["/verify/run_verify.sh"]
