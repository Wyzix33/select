import Tooltip from 'tooltip';
import { add, rem } from 'event';
import { emit, req } from 'socket';
import debounce from 'utils/debounce';

export default class Select {
 constructor(el, opt) {
  this.el_ = el;
  this._id = Math.random();
  Object.assign(this, { minWidth: 768 }, opt);
  if (!this.data.remote && !this.data.local) this.data.local = Math.random();
  if (this.arr) this.data.arr = this.arr;
  this.data._id = this._id;
  this.visibleNodeCount_ = 20;
  this.visibleRows_ = [];
  this.vPort_ = document.createElement('div');
  this.vPort_.className = 'selvport';
  this.vH_ = document.createElement('div');
  this.vH_.className = 'vh';
  this.vTable_ = document.createElement('table');
  this.vTable_.className = 'vtable';
  this.vPort_.append(this.vTable_, this.vH_);
  this.rowH_ = 15;
  this.tableH_ = 300;
  this.request_ = 0;
  this.act_ = 3; // 0 scroll, 1 = filter, 2 sort, 3 ini
  this.debouce_populateViewport_ = debounce(this.populateViewport_.bind(this), !this.data.remote ? 6 : 40);
  this.debouce_filterInput_ = debounce(this.filterInput_.bind(this), 400);

  this.build_();
  add(this.vPort_, 'scroll', this.scroll_.bind(this), this._id);
  add(this.vPort_, 'click', this.onSelect_.bind(this), this._id);
  add(this.label_, 'input', this.debouce_filterInput_.bind(this), this._id);
  add(document, 'click', this.hideTip_.bind(this), this._id);
  add(this.label_, 'blur', this.onBlur_.bind(this), this._id);
  add(this.label_, 'focus', this.showTip_.bind(this), this._id);
  add(this.label_, 'keydown', this.keyNav.bind(this), this._id, { capture: true, passive: true });
 }

 hideTip_(e) {
  if (!this.tip_.tip.popper.contains(e.target) && !this.el_.contains(e.target)) this.tip_.tip.hide();
 }

 onBlur_(e) {
  if (this.tip_.tip.popper.contains(e.relatedTarget)) return;
  this.tip_.tip.hide();
  if (!this.selected_) this.label_.value = '';
 }

 showTip_() {
  if (!this.tip_.tip.state.isShown) this.tip_.tip.show();
 }

 onSelect_(e, tr) {
  this.select_(this.visibleRows_[tr ? e.rowIndex : e.target.parentElement.rowIndex]);
 }

 filterInput_(e) {
  this.data.filter = e.target.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  this.act_ = 1;
  this.selected_ = null;
  if (this.startIndex_) this.vPort_.scrollTop = 0;
  else this.populateViewport_(0);
  this.sel = null;
  if (!this.tip_.tip.state.isShown) this.tip_.tip.show();
 }

 build_() {
  this.el_.className = 'select';
  this.label_ = document.createElement('input');
  this.label_.type = 'text';
  this.label_.className = 'label';
  this.label_.placeholder = this.label || 'Select';
  this.close = document.createElement('div');
  this.close.className = 'close';
  add(this.close, 'mousedown', this.reset.bind(this), this._id);
  this.el_.append(this.label_, this.close);
  this.generateSearchField_();
  this.populateViewport_(0);
  delete this.arr;
  delete this.data.arr;
  this.tip_ = new Tooltip({
   ref: this.label_,
   appendTo: document.body,
   offset: [0, 2],
   placement: 'bottom-start',
   content: this.vPort_,
   hideOnEsc: true,
   hideOnClick: false,
   zIndex: 10,
   onShow: this.populateViewport_.bind(this, 0, 1),
  });
  if (this.default) req('select', { ...this.data, find: this.default }).then(this.select_.bind(this));
 }

 generateSearchField_() {
  this.data.arr.forEach((element) => {
   if (this.searchKeys) {
    const s = [];
    this.searchKeys.forEach((key) => s.push(element[key]));
    element.s = s.join(' ');
   } else element.s = element[this.valueKey];
  });
 }

 scroll_() {
  const pos = this.vPort_.scrollTop;
  const startIndex = Math.floor(Math.min(this.lastPageH_, pos) / 15);
  if (this.startPos_ === startIndex) return;
  this.startPos_ = startIndex;
  this.debouce_populateViewport_(startIndex);
 }

 populateViewport_(scrollIndex, open = 0) {
  if (open) this.act_ = 1;
  const startIndex = scrollIndex;
  if (startIndex === this.startIndex_ && this.lastReq_ === this.request_) return;
  let currentStartIndex = scrollIndex;
  this.lastReq_ = this.request_;
  let top = false;
  let limit = 0;
  if (startIndex < this.startIndex_) {
   limit = this.startIndex_ - startIndex;
   top = true;
  } else if (startIndex > this.startIndex_) {
   limit = startIndex - this.startIndex_;
   if (limit < this.visibleNodeCount_) currentStartIndex += this.visibleNodeCount_ - limit;
  }
  if (limit > this.visibleNodeCount_ || !limit) limit = this.visibleNodeCount_;
  req('select_opts', { data: this.data, skip: currentStartIndex, limit, act: this.act_ }, { rid: (this.request_ += 1) }).then((res) => {
   const { tr, rows, rid } = res;
   if (rid !== this.request_) return;
   const rowsLen = rows.length;
   delete this.data.filter;
   if (tr !== undefined) {
    this.totalRows_ = tr;
    this.scrollH_ = this.totalRows_ * 15;
    this.lastPageH_ = Math.max(Math.floor(this.scrollH_ - this.tableH_), 0);
    this.vH_.style.height = this.scrollH_ + 'px';
    const diff = this.visibleRows_.length - rowsLen;
    if (diff > 0) {
     this.visibleRows_.splice(-diff);
     for (let i = 0; i < diff; i += 1) this.vTable_.deleteRow(-1);
    } else this.visibleRows_ = rows;
   }
   this.startIndex_ = startIndex;
   if (rowsLen === this.visibleNodeCount_) this.visibleRows_ = rows;
   else if (!rowsLen) for (let i = 0; i < this.visibleNodeCount_; i += 1) this.vTable_.deleteRow(-1);
   else if (top) {
    this.visibleRows_.unshift(...rows);
    this.visibleRows_.splice(-rowsLen);
   } else {
    this.visibleRows_.push(...rows);
    this.visibleRows_.splice(0, rowsLen);
   }
   this.renderFill_();
   if (this.act_ && this.vTable_.rows.length) {
    [this.sel_] = this.vTable_.rows;
    this.sel_.className = 'selected';
   }
   this.act_ = 0;
  });
 }

 renderFill_() {
  let rowEl = this.vTable_.rows[0];
  this.visibleRows_.forEach((row) => {
   if (!row) return;
   if (!rowEl) rowEl = this.addEmptyRow_();
   rowEl.firstElementChild.innerHTML = this.onSelect(row);
   rowEl = rowEl.nextElementSibling;
  });
 }

 addEmptyRow_() {
  const rowEl = document.createElement('tr');
  const td = document.createElement('td');
  rowEl.appendChild(td);
  this.vTable_.appendChild(rowEl);
  return rowEl;
 }

 reset(e) {
  this.label_.value = '';
  this.selected_ = null;
  if (this.default && !e) req('select', { ...this.data, find: { [this.valueKey]: this.default } }).then(this.select_.bind(this));
  else this.close.style.display = 'none';
 }

 select_(i) {
  this.label_.value = this.onSelect(i);
  this.selected_ = i;
  this.tip_?.tip.hide();
  this.close.style.display = 'block';
 }

 keyNav(e) {
  let directia;
  if (e.key === 'ArrowDown') directia = 'nextElementSibling';
  else if (e.key === 'ArrowUp') directia = 'previousElementSibling';
  else if (e.key === 'Enter') this.onSelect_(this.sel_, 1);
  if (directia) {
   if (this.sel_ && this.vTable_.contains(this.sel_)) {
    this.sel_.classList.remove('selected');
    if (!this.sel_[directia]) {
     this.vPort_.scrollBy(0, directia === 'nextElementSibling' ? 15 : -15);
    } else this.sel_ = this.sel_[directia];
   } else [this.sel_] = this.vTable_.rows;
   this.sel_.classList.add('selected');
   e.stopPropagation();
  }
 }

 get value() {
  return this.selected_;
 }

 destroy() {
  rem(this._id);
  emit('table_destroy', { data: this.data });
  this.tip_.destroy();
  this.tip_ = null;
 }
}
