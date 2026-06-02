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

## Publicar no Render

Configuração recomendada:

```text
Build Command: npm install
Start Command: npm start
```

O servidor usa `process.env.PORT`, então funciona no Render sem ajuste extra.

## Logos

Esta versão não depende mais da HLTV para os logos.

O endpoint `/api/logo/:teamId` tenta buscar e servir a imagem real do time usando várias fontes, nesta ordem:

1. repositório público `lootmarket/esport-team-logos` via Fastly/GitHub Raw;
2. logo do domínio oficial do time via Clearbit;
3. favicon/logo do domínio oficial via Unavatar;
4. favicon grande via Google S2.

O navegador recebe a imagem pelo próprio backend, então evita parte dos bloqueios de hotlink/CORS. Se todas as fontes falharem, o card cai para iniciais temporárias, mas não usa logo inventado.

## Dados ao vivo

- Resultados/calendário: tenta HLTV primeiro.
- Se a HLTV bloquear, usa fallback local para manter o tracker funcionando.
- Palpites ficam salvos no `localStorage` do navegador.
