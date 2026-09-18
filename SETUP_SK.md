# ReVolt Drive – automatizovaný katalóg

Toto je prvá full-stack verzia systému ReVolt Drive.

## Aktuálne
- verejný katalóg vozidiel
- detail vozidla
- administrácia /admin.html
- import URL z AutoScout24 a mobile.de
- samostatná predajná cena
- stav VOĽNÉ / REZERVOVANÉ / PREDANÉ
- databázový model pre autá, výbavu a fotografie
- nákupná cena a zdrojový URL sú určené iba pre internú administráciu

## Produkčné kroky
1. Cloudflare Worker + D1 databáza
2. R2 bucket pre vlastné fotografie
3. ADMIN_PASSWORD a autentizácia administrácie
4. inicializácia schema.sql
5. otestovanie všetkých 4 AutoScout24 ponúk

## Poznámka
AutoScout24 môže meniť HTML alebo používať ochranu proti automatickému načítaniu. Importér preto treba testovať na aktuálnych odkazoch.

Automatické maskovanie EČV a odstránenie reklamných prvkov z fotografií bude samostatná obrazová pipeline; v tejto verzii sa netvári ako hotová, kým nebude reálne otestovaná.
