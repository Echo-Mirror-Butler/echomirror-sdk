FROM python:3.12-slim

WORKDIR /fixture

COPY server.py /fixture/server.py

EXPOSE 18080 18081

ENV FIXTURE_SPEC_PATH=/fixture/contract-spec.json

CMD ["python", "server.py"]