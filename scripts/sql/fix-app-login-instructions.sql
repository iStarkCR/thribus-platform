-- Ajusta a mensagem de instruções do app TexApp pra incluir login + senha.
-- Antes: "Seu login no app é o seu CPF (somente números)."
-- Depois: "Seu login no app é o seu CPF (somente números). A senha são os 6 primeiros dígitos do seu CPF."

update agents set
  system_prompt = replace(
    system_prompt,
    'Seu login no app é o seu CPF (somente números).',
    E'Seu login no app é o seu CPF (somente números).\n🔑 A senha são os 6 primeiros dígitos do seu CPF.'
  ),
  updated_at = now()
where name = 'Bianca';

-- Confirma
select
  case when system_prompt ilike '%6 primeiros dígitos%' then 'fix aplicado ✅'
       else 'fix NÃO aplicado ❌' end as status
from agents where name = 'Bianca';
