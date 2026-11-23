# Catálogo admin em feed

- Substituir a tabela por cards em uma única coluna centralizada de até 640px, com fotos 4:3, dados atuais do produto e paginação de 20 itens.
- Manter seleção e envio do catálogo, pesquisa e ação Calcular; adicionar filtro visual de categoria no topo fixo.
- Abrir o formulário atual em modal (bottom sheet no celular) ao tocar no card ou no botão fixo “Novo produto”; manter upload, compressão e salvamento existentes, com preview e validação dos campos.
- Menu com Editar e Duplicar. **Não incluir Excluir**, conforme sua escolha, para preservar a integração com Sheets.
- Mostrar skeleton durante carregamento e estado vazio com “Cadastrar primeiro produto”.

## Detalhes técnicos
- Alterações restritas à apresentação do Catálogo e testes; reutilizar `saveProduct` e os componentes/tokens atuais.
- Disponibilidade continua derivada do estoque; lucro exibido é o valor configurado em R$ ou %, sem novos cálculos.
- Não alterar permissões, dados, cálculos ou outras telas.
- Verificar filtros, paginação, modal e aparência no celular e desktop sem gravar produtos de teste na planilha.