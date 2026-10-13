/**
 * Шаблоны-ПРИМЕРЫ печатных форм. Они НЕ являются утверждёнными формами документов:
 * перед использованием в официальном документообороте ответственное лицо должно привести их
 * в соответствие с действующими требованиями и отметить шаблон как проверенный.
 */
const STYLE = `<style>
body{font-family:"Times New Roman",serif;font-size:12pt;margin:15mm}
h1{font-size:14pt;text-align:center;margin:0 0 6pt}
.sub{text-align:center;margin-bottom:10pt}
table{border-collapse:collapse;width:100%;font-size:10pt}
th,td{border:1px solid #000;padding:2pt 4pt;vertical-align:top}
th{background:#f0f0f0}
.warn{border:2px solid #c00;color:#c00;padding:6pt;margin-bottom:10pt;font-family:Arial,sans-serif;font-size:10pt}
.sign{margin-top:24pt}
@media print{.noprint{display:none}}
</style>`;

export const DEFAULT_TEMPLATES = [
  {
    code: 'BRIEFING_JOURNAL',
    name: 'Журнал регистрации инструктажей (пример)',
    content: `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Журнал инструктажей</title>${STYLE}</head><body>
{{#unless verified}}<div class="warn">Шаблон не проверен на соответствие обязательным требованиям. Не использовать в официальном документообороте до проверки.</div>{{/unless}}
<div class="sub">{{organization}}</div>
<h1>Журнал регистрации инструктажей по охране труда</h1>
<div class="sub">{{#if unitName}}Подразделение: {{unitName}}. {{/if}}{{#if period}}Период: {{period}}{{/if}}</div>
<table><thead><tr>
<th>№</th><th>Дата</th><th>Фамилия, имя, отчество</th><th>Таб. №</th><th>Профессия (должность)</th><th>Вид инструктажа</th>
<th>Тема / инструкция</th><th>ФИО проводившего</th><th>Результат</th><th>Подтверждение</th></tr></thead><tbody>
{{#each rows}}<tr><td>{{inc @index}}</td><td>{{date this.date}}</td><td>{{this.fullName}}</td><td>{{this.personnelNumber}}</td><td>{{this.position}}</td>
<td>{{this.type}}</td><td>{{this.topic}}</td><td>{{this.instructor}}</td><td>{{this.result}}</td><td>{{this.confirmation}}</td></tr>{{/each}}
</tbody></table>
<p style="font-size:9pt">Графа «Подтверждение» отражает зарегистрированный в системе способ фактического подтверждения. Система не формирует подписи работников.</p>
</body></html>`,
  },
  {
    code: 'KNOWLEDGE_CHECK_PROTOCOL',
    name: 'Протокол проверки знаний (пример)',
    content: `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Протокол проверки знаний</title>${STYLE}</head><body>
{{#unless verified}}<div class="warn">Шаблон не проверен на соответствие обязательным требованиям. Не использовать в официальном документообороте до проверки.</div>{{/unless}}
<div class="sub">{{organization}}</div>
<h1>ПРОТОКОЛ № {{protocolNumber}}</h1>
<div class="sub">проверки знаний по вопросам охраны труда от {{date protocolDate}}</div>
<p>Вид проверки: {{checkType}}. {{#if reason}}Основание: {{reason}}.{{/if}} Дата проведения: {{date conductedDate}}.</p>
{{#if commission}}<p>Комиссия: {{commission.name}}{{#if commission.orderNumber}} (приказ № {{commission.orderNumber}}{{#if commission.orderDate}} от {{date commission.orderDate}}{{/if}}){{/if}}.</p>
<p>{{#each commission.members}}{{this.role}}: {{this.name}}{{#unless @last}}; {{/unless}}{{/each}}</p>{{/if}}
{{#if responsible}}<p>Ответственное лицо: {{responsible}}</p>{{/if}}
<table><thead><tr><th>№</th><th>Фамилия, имя, отчество</th><th>Должность (профессия)</th><th>Подразделение</th><th>Результат</th><th>Дата следующей проверки</th><th>Примечание</th></tr></thead><tbody>
{{#each participants}}<tr><td>{{inc @index}}</td><td>{{this.fullName}}</td><td>{{this.position}}</td><td>{{this.unit}}</td><td>{{this.outcome}}</td><td>{{date this.nextCheckDate}}</td><td>{{this.comment}}</td></tr>{{/each}}
</tbody></table>
<div class="sign">{{#each commission.members}}<p>{{this.role}} ____________________ {{this.name}}</p>{{/each}}</div>
</body></html>`,
  },
  {
    code: 'PPE_PERSONAL_CARD',
    name: 'Личная карточка учёта выдачи СИЗ (пример)',
    content: `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Личная карточка учёта СИЗ</title>${STYLE}</head><body>
{{#unless verified}}<div class="warn">Шаблон не проверен на соответствие обязательным требованиям. Не использовать в официальном документообороте до проверки.</div>{{/unless}}
<div class="sub">{{organization}}</div>
<h1>Личная карточка учёта выдачи средств индивидуальной защиты</h1>
<p>Фамилия, имя, отчество: <b>{{employee.fullName}}</b>. Табельный номер: {{employee.personnelNumber}}.</p>
<p>Подразделение: {{employee.unit}}. Профессия (должность): {{employee.position}}. Дата приёма: {{date employee.hireDate}}.</p>
<h3>Предусмотрено нормами</h3>
<table><thead><tr><th>Наименование СИЗ</th><th>Количество</th><th>Срок носки</th><th>Основание</th></tr></thead><tbody>
{{#each norms}}<tr><td>{{this.item}}</td><td>{{this.quantity}} {{this.unit}}</td><td>{{this.wear}}</td><td>{{this.basis}}</td></tr>{{/each}}
</tbody></table>
<h3>Выдано</h3>
<table><thead><tr><th>Наименование СИЗ</th><th>Размер</th><th>Дата выдачи</th><th>Кол-во</th><th>Срок носки, мес.</th><th>Плановая замена</th><th>Получение подтверждено</th><th>Возврат / списание</th></tr></thead><tbody>
{{#each issues}}<tr><td>{{this.item}}</td><td>{{this.size}}</td><td>{{date this.issueDate}}</td><td>{{this.quantity}}</td><td>{{this.wearMonths}}</td><td>{{date this.replacement}}</td><td>{{this.confirmed}}</td><td>{{this.returns}}</td></tr>{{/each}}
</tbody></table>
</body></html>`,
  },
];
