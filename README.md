# CS2 Pick'em Live Tracker — Thiago Deluca

Tracker visual de Pick'em para CS2 Major com palpites editáveis, logos quando disponíveis, atualização via HLTV e validação automática: correto, com chance ou sem chance.

## Rodar localmente

```bash
npm start
```

Abra:

```txt
http://localhost:8080
```

## Deploy grátis recomendado

### Render
- Tipo: Web Service
- Runtime: Node
- Build command: vazio ou `npm install`
- Start command: `npm start`
- Porta: Render injeta `PORT` automaticamente

### Vercel / Netlify
Também dá, mas para ficar perfeito precisa adaptar `/api/live` para serverless function. Para este projeto simples com backend Node puro, Render é o caminho mais direto.
