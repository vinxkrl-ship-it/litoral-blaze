# 🔧 Como fazer o sistema funcionar — Passo a Passo

## BUG 1 CORRIGIDO: Admin não via usuários
**Causa:** A política de segurança do banco de dados (RLS) tinha uma referência circular.
**Solução:** O arquivo `supabase/schema.sql` foi corrigido. Você precisa re-executar o SQL.

## BUG 2 CORRIGIDO: Não conectava ao bestblaze
**Causa:** O código de busca de rodadas estava com parsing frágil e sem logs de erro.
**Solução:** A Edge Function e o hook foram melhorados com mais robustez.

---

## ✅ PASSOS PARA ATUALIZAR (faça agora)

### PASSO 1 — Atualizar o banco de dados (OBRIGATÓRIO para o Bug 1)

1. Acesse https://supabase.com e entre no seu projeto
2. Clique em **SQL Editor** (ícone de banco de dados no menu lateral)
3. Clique em **+ New query**
4. Copie TODO o conteúdo do arquivo `supabase/schema.sql` e cole lá
5. Clique em **Run** (ou Ctrl+Enter)
6. Deve aparecer "Success" — pronto!

### PASSO 2 — Re-publicar a Edge Function (OBRIGATÓRIO para o Bug 2)

A Edge Function precisa ser publicada no Supabase para funcionar.
Se você ainda não fez isso, faça:

**Opção A — Via CLI do Supabase (recomendado):**
```bash
# No terminal, dentro da pasta do projeto:
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase functions deploy get-rounds
```
(O PROJECT_REF está na URL do seu projeto Supabase: `https://app.supabase.com/project/SEU_PROJECT_REF`)

**Opção B — Via interface web:**
1. No painel do Supabase, clique em **Edge Functions**
2. Clique em **New Function** e nomeie como `get-rounds`
3. Cole o conteúdo de `supabase/functions/get-rounds/index.ts`
4. Clique em **Deploy**

### PASSO 3 — Verificar variáveis de ambiente

Certifique-se que seu `.env` tem:
```
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua_chave_anonima
VITE_ADMIN_PASS=sua_senha_admin
```

Se estiver no **Vercel**, configure essas variáveis em:
Settings → Environment Variables

---

## 🧪 Como testar se os bugs foram corrigidos

### Teste do Bug 1 (usuários no admin):
1. Faça login como admin
2. Vá para a área de admin
3. Os usuários cadastrados devem aparecer na lista

### Teste do Bug 2 (conexão bestblaze):
1. Abra o app
2. O indicador "AO VIVO" no canto superior deve ficar verde
3. As rodadas devem atualizar a cada 4 segundos

---

## ❓ Ainda não funciona?

**Usuários não aparecem:**
- Verifique se o usuário admin tem `role = 'admin'` na tabela `profiles`
- Para promover alguém a admin, execute no SQL Editor:
  ```sql
  UPDATE profiles SET role = 'admin' WHERE email = 'seu@email.com';
  ```

**bestblaze não conecta:**
- Verifique os logs da Edge Function no painel Supabase → Edge Functions → get-rounds → Logs
- O site bestblaze.com.br pode estar fora do ar temporariamente

