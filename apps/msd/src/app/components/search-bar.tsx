import { useState } from 'react';
import {
    OutlinedTextField,
    FilledButton,
    Icon,
} from '@skylabs-monorepo/shared-ui/react';
import { useNavigate } from 'react-router-dom';
import { spas } from '../data/spas';
export function SearchBar() {
    const [search, setSearch] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const navigate = useNavigate();
    const suggestions = [
        ...new Set(
            spas.flatMap((spa) => [
                spa.city,
                spa.eyebrow,
            ])
        ),
    ];
    const filteredSuggestions = suggestions.filter(
        (item) =>
            search.trim() &&
            item.toLowerCase().includes(search.toLowerCase())
    );
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && search.trim()) {
            const value = search;
            setSearch('');
            setShowSuggestions(false);
            navigate(`/search?q=${value}`);
        }
    };

    return (
        <>
            <div className="blog__toolbar">
                <div className="blog__search">
                    <OutlinedTextField
                        label="Search location"
                        placeholder="Search spas, city, location..."
                        value={search}
                        onInput={(e) => {
                            setSearch((e.target as HTMLInputElement).value);
                            setShowSuggestions(true);
                        }}
                        onKeyDown={handleKeyDown}
                    >
                        <Icon slot="leading-icon">search</Icon>
                    </OutlinedTextField>

                    {showSuggestions &&
                        search &&
                        filteredSuggestions.length > 0 && (
                            <div className="search-suggestions">
                                {filteredSuggestions.map((item) => (
                                    <div
                                        key={item}
                                        className="search-suggestion"
                                        onClick={() => {
                                            setSearch('');
                                            setShowSuggestions(false);
                                            navigate(`/search?q=${item}`);
                                        }}
                                    >
                                        {item}
                                    </div>
                                ))}
                            </div>
                        )}

                </div>
                <FilledButton
                    onClick={() => {
                        setSearch("");
                        setShowSuggestions(false);
                        navigate("/search?nearMe=true");
                    }}
                >
                    Near Me
                </FilledButton>
            </div>
        </>
    );
}