export default function autocompletion() {
    const input = document.getElementById('clientAddress');
    const suggestions = document.getElementById('clientAddressSuggestions');
    let debounceTimer;

    input.addEventListener('input', () => {
        const query = input.value.trim();
        suggestions.innerHTML = '';

        if (query.length < 3) return;

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`)
                .then(res => res.json())
                .then(data => {
                    suggestions.innerHTML = '';
                    data.features.forEach(feature => {
                        const li = document.createElement('li');
                        li.textContent = feature.properties.label;
                        li.addEventListener('click', () => {
                            input.value = feature.properties.label;
                            suggestions.innerHTML = '';
                        });
                        suggestions.appendChild(li);
                    });
                })
                .catch(err => {
                    console.error("Erreur API Adresse :", err);
                });
        }, 400); // debounce de 400ms
    });
}