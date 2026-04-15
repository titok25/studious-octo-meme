const Checkout = {
    stateKey: 'ml_checkout_state',

    getState() {
        const saved = localStorage.getItem(this.stateKey);
        if (saved) return JSON.parse(saved);
        return {
            productName: '',
            amount: 0,
            productImg: '',
            items: [],
            customer: {
                name: '', email: '', phone: '', cpf: '',
                zipcode: '', address: '', number: '', neighborhood: '',
                city: '', state: '', shipping_method: 'Chegará amanhã - Grátis'
            },
            pixCode: '', transactionId: ''
        };
    },

    saveState(state) {
        localStorage.setItem(this.stateKey, JSON.stringify(state));
    },

    updateCustomer(data) {
        const state = this.getState();
        state.customer = { ...state.customer, ...data };
        this.saveState(state);
    },

    formatCurrency(v) {
        return (v / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    },

    renderSummary() {
        const state = this.getState();
        const els = {
            subtotal: document.getElementById('ml-sum-subtotal'),
            total: document.getElementById('ml-sum-total'),
            name: document.getElementById('ml-sum-product-name'),
            img: document.getElementById('ml-sum-product-img'),
            price: document.getElementById('ml-sum-item-price')
        };

        if (els.subtotal) els.subtotal.textContent = this.formatCurrency(state.amount);
        if (els.total) els.total.textContent = this.formatCurrency(state.amount);
        if (els.name) els.name.textContent = state.productName;
        if (els.price) els.price.textContent = this.formatCurrency(state.amount);
        if (els.img && state.productImg) {
            let src = state.productImg;
            if (!src.startsWith('http')) {
                if (!src.startsWith('../')) {
                    src = '../' + src.replace(/^(\.\.\/)+/, '');
                }
            }
            els.img.src = src;
        }
    },

    renderSummarySimple() {
        const state = this.getState();
        const els = {
            subtotal: document.getElementById('ml-sum-subtotal'),
            total: document.getElementById('ml-sum-total'),
            name: document.getElementById('ml-sum-product-name')
        };

        if (els.subtotal) els.subtotal.textContent = this.formatCurrency(state.amount);
        if (els.total) els.total.textContent = this.formatCurrency(state.amount);
        if (els.name) els.name.textContent = state.productName;
    },

    renderStepSummaries(currentStep) {
        this.renderSummary();
        const state = this.getState();
        
        if (currentStep > 1) {
            const el = document.getElementById('ml-step-summary-1');
            if (el) el.innerHTML = `<div class="ml-step-summary"><div class="ml-step-summary-data"><b>${state.customer.name}</b><span>${state.customer.email} • ${state.customer.phone}</span></div><a href="identificacao.html" class="ml-card-edit">Alterar</a></div>`;
        }
        if (currentStep > 2) {
            const el = document.getElementById('ml-step-summary-2');
            if (el) el.innerHTML = `<div class="ml-step-summary"><div class="ml-step-summary-data"><b>${state.customer.address}, ${state.customer.number}</b><span>${state.customer.neighborhood}, ${state.customer.city} - ${state.customer.state}</span></div><a href="entrega.html" class="ml-card-edit">Alterar</a></div>`;
        }
        if (currentStep > 3) {
            const el = document.getElementById('ml-step-summary-3');
            if (el) el.innerHTML = `<div class="ml-step-summary"><div class="ml-step-summary-data"><b>${state.customer.shipping_method}</b><span>Entrega Full</span></div><a href="envio.html" class="ml-card-edit">Alterar</a></div>`;
        }
    },

    maskCPF(v) { return v.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4').substring(0, 14); },
    maskPhone(v) { 
        v = v.replace(/\D/g, '');
        return v.length > 10 ? v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3').substring(0, 15) : v.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3').substring(0, 14);
    },
    maskCEP(v) { return v.replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2').substring(0, 9); },

    initMasks() {
        const f = (id, mask) => { const el = document.getElementById(id); if (el) el.oninput = (e) => e.target.value = mask(e.target.value); };
        f('ml-input-cpf', this.maskCPF);
        f('ml-input-phone', this.maskPhone);
        f('ml-input-zipcode', (v) => {
            const res = this.maskCEP(v);
            if (res.length === 9) this.fetchAddress(res.replace('-', ''));
            return res;
        });
    },

    fetchAddress(cep) {
        fetch(`https://viacep.com.br/ws/${cep}/json/`).then(r => r.json()).then(d => {
            if (!d.erro) {
                const f = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
                f('ml-input-address', d.logradouro); f('ml-input-neighborhood', d.bairro);
                f('ml-input-city', d.localidade); f('ml-input-state', d.uf);
            }
        });
    },

    validateCPF(cpf) {
        cpf = cpf.replace(/\D/g, '');
        if (cpf.length !== 11 || !!cpf.match(/(\d)\1{10}/)) return false;
        const calc = (slice, factor) => slice.split('').reduce((a, c, i) => a + parseInt(c) * (factor - i), 0) * 10 % 11 % 10;
        return calc(cpf.slice(0, 9), 10) === parseInt(cpf[9]) && calc(cpf.slice(0, 10), 11) === parseInt(cpf[10]);
    }
};
document.addEventListener('DOMContentLoaded', () => { Checkout.initMasks(); Checkout.renderSummary(); });
