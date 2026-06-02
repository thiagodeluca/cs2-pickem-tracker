# CS2 Pick'em Tracker • PandaScore

Projeto de Thiago Deluca.

Tracker de Pick'em para CS2 com dados via PandaScore, salvamento local dos palpites e validação automática.

## Rodar local

```bash
export PANDASCORE_TOKEN="seu_token"
npm start
```

Abra:

```text
http://localhost:8080
```

## Render

Configure no Render em **Environment**:

```text
PANDASCORE_TOKEN=seu_token
EVENT_NAME=IEM Cologne Major 2026
EVENT_KEYWORDS=iem,cologne,major
EVENT_START=2026-06-02T00:00:00Z
EVENT_END=2026-06-09T23:59:59Z
CACHE_SECONDS=45
```

Build Command:

```bash
npm install
```

Start Command:

```bash
npm start
```

## Observações

- O token fica só no backend.
- O front consome `/api/event-state`.
- Os palpites do usuário ficam no `localStorage` do navegador.
- Se a API falhar ou não achar o evento pelo nome, o projeto mantém fallback para não quebrar a tela.


## v2
- Layout refinado: cards mais legíveis, colunas mais estáveis, cores estilo Steam/dark dashboard e melhor responsividade.
