# CS2 Pick'em Tracker — Thiago Deluca

Tracker web para Pick'em do IEM Cologne Major 2026.

## Rodar local

```bash
npm install
npm start
```

Abra:

```text
http://localhost:8080
```

## Logos

Os logos agora vêm direto da HLTV:

- `/api/logo/:teamId` busca a página oficial do time na HLTV;
- extrai a URL original do `img-cdn.hltv.org/teamlogo/...`;
- redireciona o navegador para o logo real;
- `/api/live` também tenta preencher os logos usando as páginas oficiais da HLTV.

Se a HLTV bloquear a request no servidor, o app mostra apenas as iniciais temporariamente, sem usar logo fake.
