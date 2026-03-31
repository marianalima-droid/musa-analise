// api/analyze.js — Vercel Serverless Function
export const config = { maxDuration: 120 };

const SYS = `Analista contratual sênior da Musa Tecnologia. Compare o contrato recebido com os padrões abaixo e retorne JSON.

PADRÕES MUSA:
2.4: Escopo = MTR,CDF,DMR,CADRI. DMR/CADRI custam 1 salário mínimo cada.
2.5: Musa NÃO executa coleta/transporte diretamente.
3.2.a: Pagamento 30 dias após NF.
3.2.b: Valores ajustáveis por volume ou coletas extraordinárias aprovadas.
3.5: Musa não emite MTR sem dados cadastrais do Gerador.
4.5: Musa NÃO responde diretamente pelos Operadores Parceiros.
4.6.b: Coleta pontual em até 48h.
4.6.d: Resíduos diferentes têm valor informado antes e aprovação do Gerador.
5.2: Valor reciclável varia por qualidade, quantidade e mercado (trimestral).
6.1: Fatura até dia 10; vencimento 30 dias; multa 10%+1%/mês+IGPM; suspensão com 24h.
6.3: Reajuste IPCA anual ou 30 dias de aviso por custos.
6.4: Custos extras cobráveis.
7.1.c: Após 15 dias, Musa assume responsabilidade.
7.4.4: Responsabilidade limitada aos últimos 12 meses.
8.b: Renovação automática.
9.1.a: Cancelamento com 60 dias de aviso, sem multa.
9.3.c: Multa 20% limitada a 12 meses em cancelamento com motivo.
11.1.a: Proibição contratar transportadoras por 3 meses após encerramento.
11.2.a: Ajuste preços com 30 dias de aviso.
13: Foro exclusivo São Paulo/SP.

MATRIZ (situação→risco|aprovação):
2.4 escopo ilimitado→alto|N3-Jurídico
2.5 execução direta→nao_aceitavel|NX
3.2.a prazo≠30d→medio|N3-Financeiro
3.2.b impede ajuste→medio|N2-Comercial
3.5 exclui isenção MTR→nao_aceitavel|NX
4.5 resp.direta→alto|N4+N3
4.6 <48h→alto|N2-Operações
5.2 exclui variação→medio|N2-Operações
6.1 altera prazos→medio|N3-Financeiro
6.3 exclui reajuste→medio|N3-Jurídico
6.4 exclui custos→nao_aceitavel|NX
7.4.4 reduz cap→nao_aceitavel|NX
9.3.c altera multa→medio|N3-Jurídico
11.1.a reduz prazo→alto|N2-Operações
13 altera foro→nao_aceitavel|NX
Item 2→item2|Área
Itens 1,3,4→baixo|Manual
Não listado→nao_mapeada

Retorne SOMENTE JSON válido (sem markdown):
{"gerador":"","alerta_sem_track_changes":false,"clausulas_sem_marcacao":[],"resumo":{"nao_aceitavel":0,"alto":0,"medio":0,"nao_mapeada":0,"item2":0,"baixo":0},"alteracoes":[{"clausula_template":"","clausula_contrato":"","nome":"","nivel":"","original":"","alterado":"","descricao":"","impacto":"","aprovacao":"","recomendacao":""}]}`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { contractText } = req.body;
  if (!contractText?.trim()) return res.status(400).json({ error: "Contrato não fornecido." });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY não configurada no Vercel." });
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        system: SYS,
        messages: [{ role: "user", content: "Analise o contrato e retorne apenas o JSON:\n\n" + contractText }]
      })
    });
    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      return res.status(resp.status).json({ error: "Erro API " + resp.status + ": " + (e?.error?.message || resp.statusText) });
    }
    const data = await resp.json();
    const raw = data.content?.find(b => b.type === "text")?.text || "";
    if (!raw) return res.status(500).json({ error: "Resposta vazia da API." });
    const clean = raw.replace(/```json\n?|\n?```/g, "").trim();
    let parsed;
    try { parsed = JSON.parse(clean); }
    catch { const m = clean.match(/\{[\s\S]*\}/); if (!m) return res.status(500).json({ error: "JSON inválido." }); parsed = JSON.parse(m[0]); }
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
