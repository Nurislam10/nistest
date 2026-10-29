'use strict';

const fs = require('fs');
const path = require('path');

// Нәтижелерді JSON файлда сақтайтын қарапайым қойма.
class Store {
  constructor(file) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.items = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  }

  save() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.items, null, 2));
    fs.renameSync(tmp, this.file);
  }

  add(item) {
    this.items.push(item);
    this.save();
    return item;
  }

  all() {
    return this.items;
  }

  get(id) {
    return this.items.find((i) => i.id === id);
  }

  remove(id) {
    const before = this.items.length;
    this.items = this.items.filter((i) => i.id !== id);
    if (this.items.length !== before) this.save();
    return this.items.length !== before;
  }
}

module.exports = { Store };
