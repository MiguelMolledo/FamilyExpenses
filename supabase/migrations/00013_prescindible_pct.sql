-- El recorte no siempre es todo-o-nada: calefacción con 2500 €/año no se
-- puede quitar entera, pero sí la mitad. prescindible pasa de booleano a
-- porcentaje: 0 = imprescindible, 100 = se corta entera, 50 = la mitad.
-- Del presupuesto (y del gasto real, para la capacidad de reacción) cuenta
-- como prescindible importe × pct/100.

set search_path = family, public;

alter table subcategories
  add column prescindible_pct numeric(5, 2) not null default 0
    check (prescindible_pct >= 0 and prescindible_pct <= 100);

update subcategories set prescindible_pct = 100 where prescindible;

alter table subcategories drop column prescindible;
